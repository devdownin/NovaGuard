import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { Camera, VideoFile } from 'react-native-vision-camera';
import { MaxDuration } from '../state/types';
import { maxDurationMs } from './library';
import { ensureRecordingsDir, fileSize, RECORDINGS_DIR } from './videoStore';

export interface Clip {
  path: string;
  bytes: number;
  /** Seconds, as reported by the encoder rather than measured by our timers. */
  duration: number;
}

interface Options {
  cameraRef: RefObject<Camera | null>;
  /** Recording is only ever attempted while this is true. */
  enabled: boolean;
  max: MaxDuration;
  onClip: (clip: Clip) => void;
  onError?: (message: string) => void;
}

export interface Recorder {
  isRecording: boolean;
  /** Returns false if already recording, disabled, or the clip directory isn't ready. */
  start: () => boolean;
  /**
   * Returns false if nothing was recording — the caller then knows no clip is
   * coming through `onClip` and must close the session itself.
   */
  stop: () => boolean;
}

/**
 * Wraps VisionCamera's file recorder.
 *
 * VisionCamera hands the clip back through `onRecordingFinished` rather than a
 * promise, and throws if you stop a recording that never started, so the
 * in-flight state lives in a ref that both callbacks and the duration cap read.
 */
export function useRecorder({ cameraRef, enabled, max, onClip, onError }: Options): Recorder {
  const [isRecording, setIsRecording] = useState(false);
  const activeRef = useRef(false);
  const readyRef = useRef(false);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callbacks are read through refs so a re-render mid-recording can't leave
  // VisionCamera holding a stale `onClip` from a previous settings value.
  const onClipRef = useRef(onClip);
  const onErrorRef = useRef(onError);
  useEffect(() => { onClipRef.current = onClip; }, [onClip]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    let cancelled = false;
    ensureRecordingsDir()
      .then(() => { if (!cancelled) readyRef.current = true; })
      .catch(() => { onErrorRef.current?.("Dossier d'enregistrement inaccessible"); });
    return () => { cancelled = true; };
  }, []);

  const clearCap = useCallback(() => {
    if (capTimerRef.current) {
      clearTimeout(capTimerRef.current);
      capTimerRef.current = null;
    }
  }, []);

  const stop = useCallback((): boolean => {
    if (!activeRef.current) return false;
    clearCap();
    // Leave `activeRef` set until the callback fires: stopping is asynchronous,
    // and a start() slipping in before then would throw inside VisionCamera.
    try {
      cameraRef.current?.stopRecording();
      return true;
    } catch {
      activeRef.current = false;
      setIsRecording(false);
      return false;
    }
  }, [cameraRef, clearCap]);

  const start = useCallback((): boolean => {
    const camera = cameraRef.current;
    if (!camera || !enabled || !readyRef.current || activeRef.current) return false;

    activeRef.current = true;
    setIsRecording(true);

    try {
      camera.startRecording({
        fileType: 'mp4',
        videoCodec: 'h264',
        path: RECORDINGS_DIR,
        onRecordingFinished: (video: VideoFile) => {
          activeRef.current = false;
          setIsRecording(false);
          clearCap();
          // `VideoFile` has no size, so the real byte count is read back from
          // disk once the encoder has closed the file.
          fileSize(video.path).then(bytes => {
            onClipRef.current({ path: video.path, bytes, duration: video.duration });
          });
        },
        onRecordingError: error => {
          activeRef.current = false;
          setIsRecording(false);
          clearCap();
          onErrorRef.current?.(error.message);
        },
      });
    } catch (e) {
      activeRef.current = false;
      setIsRecording(false);
      onErrorRef.current?.(e instanceof Error ? e.message : 'Enregistrement impossible');
      return false;
    }

    capTimerRef.current = setTimeout(() => {
      capTimerRef.current = null;
      stop();
    }, maxDurationMs(max));
    return true;
  }, [cameraRef, clearCap, enabled, max, stop]);

  // Losing the camera (monitoring off, screen unmounted) must not leave the
  // encoder running against a file nothing will ever claim.
  useEffect(() => {
    if (!enabled && activeRef.current) stop();
  }, [enabled, stop]);

  useEffect(() => () => {
    clearCap();
    if (activeRef.current) {
      try { cameraRef.current?.stopRecording(); } catch { /* already torn down */ }
      activeRef.current = false;
    }
  }, [cameraRef, clearCap]);

  return { isRecording, start, stop };
}

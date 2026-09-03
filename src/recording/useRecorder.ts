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
  /**
   * Fired when the duration cap expires, just before the clip is cut.
   *
   * The cap has to cut the file — an encoder left running produces one
   * unbounded MP4 — but cutting the file is not the same as ending what is
   * being filmed. This hook lets the session layer close the clip itself, so
   * the clip carries its event and the next one opens straight away. The cap
   * still calls `stop()` afterwards: a handler that does nothing must not turn
   * the maximum duration into no maximum at all.
   */
  onMaxDuration?: () => void;
  /**
   * The encoder never answered a stop within {@link FINALIZE_TIMEOUT_MS}.
   *
   * `onClip` will not fire, so this is the only notice the caller gets that the
   * clip it was expecting is not coming — without it, whatever the caller set
   * aside for that clip (the event it was to carry) is simply dropped.
   */
  onAbandoned?: () => void;
  /**
   * The encoder has released the camera, before the clip's size is read back.
   *
   * `onClip` cannot serve this purpose: it waits on a `stat()` round trip over
   * the bridge, and between a stop and the next start that wait is dead air —
   * seconds of a passage nobody is filming. A caller continuing a recording
   * starts the next clip from here and lets the byte count catch up.
   */
  onEncoderFree?: () => void;
}

/**
 * How long the encoder gets to hand a clip back after a stop.
 *
 * `isRecording` stays true across that window, which is what keeps the camera
 * session alive while the file is being finalised — so it also has to end.
 * Without a bound, a stop VisionCamera never calls back on would leave the
 * preview running with surveillance switched off.
 */
export const FINALIZE_TIMEOUT_MS = 5000;

export interface Recorder {
  /** True while a clip is being written, and while a stop is still in flight. */
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
export function useRecorder({
  cameraRef, enabled, max, onClip, onError, onMaxDuration, onAbandoned, onEncoderFree,
}: Options): Recorder {
  const [isRecording, setIsRecording] = useState(false);
  const activeRef = useRef(false);
  /** Set between `stopRecording()` and the callback that answers it. */
  const stoppingRef = useRef(false);
  const readyRef = useRef(false);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callbacks are read through refs so a re-render mid-recording can't leave
  // VisionCamera holding a stale `onClip` from a previous settings value.
  const onClipRef = useRef(onClip);
  const onErrorRef = useRef(onError);
  const onMaxDurationRef = useRef(onMaxDuration);
  const onAbandonedRef = useRef(onAbandoned);
  const onEncoderFreeRef = useRef(onEncoderFree);
  useEffect(() => { onClipRef.current = onClip; }, [onClip]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onMaxDurationRef.current = onMaxDuration; }, [onMaxDuration]);
  useEffect(() => { onAbandonedRef.current = onAbandoned; }, [onAbandoned]);
  useEffect(() => { onEncoderFreeRef.current = onEncoderFree; }, [onEncoderFree]);

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

  /** Whatever the encoder answered, the recording is over. */
  const settle = useCallback(() => {
    activeRef.current = false;
    stoppingRef.current = false;
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const stop = useCallback((): boolean => {
    // A second stop while the first is still in flight is not a second clip:
    // VisionCamera throws on it, and the old code took that throw as proof
    // nothing was recording — clearing `isRecording` while the encoder was
    // still writing, which is exactly when the camera session must stay up.
    if (!activeRef.current || stoppingRef.current) return false;
    clearCap();
    // Leave `activeRef` set until the callback fires: stopping is asynchronous,
    // and a start() slipping in before then would throw inside VisionCamera.
    try {
      cameraRef.current?.stopRecording();
      stoppingRef.current = true;
      finalizeTimerRef.current = setTimeout(() => {
        settle();
        onAbandonedRef.current?.();
      }, FINALIZE_TIMEOUT_MS);
      return true;
    } catch {
      settle();
      return false;
    }
  }, [cameraRef, clearCap, settle]);

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
          settle();
          clearCap();
          // Announced before the size is read, and deliberately: the camera is
          // free now, and anything done first is footage the next clip misses.
          onEncoderFreeRef.current?.();
          // `VideoFile` has no size, so the real byte count is read back from
          // disk once the encoder has closed the file.
          fileSize(video.path).then(bytes => {
            onClipRef.current({ path: video.path, bytes, duration: video.duration });
          });
        },
        onRecordingError: error => {
          settle();
          clearCap();
          onErrorRef.current?.(error.message);
          // No clip is coming from this one either — a caller holding an event
          // for it would otherwise wait forever. A recording that was never
          // stopped has nothing set aside, so this is a no-op there.
          onAbandonedRef.current?.();
        },
      });
    } catch (e) {
      settle();
      onErrorRef.current?.(e instanceof Error ? e.message : 'Enregistrement impossible');
      return false;
    }

    capTimerRef.current = setTimeout(() => {
      capTimerRef.current = null;
      // Give the session layer the chance to stop the clip itself — that is
      // what makes the next one part of the same passage. `stop()` no-ops once
      // a stop is in flight, so it is the guarantee, not a second cut.
      onMaxDurationRef.current?.();
      stop();
    }, maxDurationMs(max));
    return true;
  }, [cameraRef, clearCap, enabled, max, settle, stop]);

  // Losing the camera (monitoring off, screen unmounted) must not leave the
  // encoder running against a file nothing will ever claim.
  useEffect(() => {
    if (!enabled && activeRef.current) stop();
  }, [enabled, stop]);

  useEffect(() => () => {
    clearCap();
    if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current);
    if (activeRef.current && !stoppingRef.current) {
      try { cameraRef.current?.stopRecording(); } catch { /* already torn down */ }
    }
    activeRef.current = false;
    stoppingRef.current = false;
  }, [cameraRef, clearCap]);

  return { isRecording, start, stop };
}

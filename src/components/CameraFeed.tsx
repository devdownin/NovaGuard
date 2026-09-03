import React, { RefObject, useEffect, useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import {
  Camera, runAsync, runAtTargetFps, useCameraDevice, useCameraFormat, useFrameProcessor,
} from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { useRunOnJS } from 'react-native-worklets-core';
import { useAppState } from '../state/AppStateContext';
import { devicePositionFor, physicalDeviceFilterFor } from '../camera/deviceSelection';
import { uprightAspect, uprightRotation } from '../camera/orientation';
import { uprightBoxToViewBox } from '../camera/framing';
import { useDetectionModel } from '../camera/useDetectionModel';
import { interpretDetections } from '../ml/interpretDetections';
import { frameErrorMessage } from '../camera/frameErrors';
import { FrameStage } from '../camera/frameTrace';
import { qualityBitRate, qualityResolution } from '../recording/library';
import { DetectionBox, FrameDetection } from '../ml/types';

const MODEL = require('../../assets/models/efficientdet-lite0.tflite');
/** EfficientDet-Lite0 takes a 320x320 uint8 image (verified against the model file). */
const MODEL_INPUT_SIZE = 320;

/**
 * Frames per second handed to the model.
 *
 * This is what "Sensibilité" actually controls, and it is worth being explicit
 * about: it sets how often the scene is looked at, so it governs how quickly a
 * subject is confirmed and how responsive the auto-zoom feels. It no longer
 * governs how long an occlusion is tolerated — the tracker counts that in
 * milliseconds (see `dropAfterMs`) so the same gap means the same thing at
 * every setting.
 */
const FPS_BY_SENSITIVITY = { Basse: 1, Moyenne: 3, Haute: 5 } as const;

interface CameraFeedProps {
  style: StyleProp<ViewStyle>;
  active: boolean;
  /** Measured viewfinder size — face bounds come back in this space (see `autoMode` below). */
  viewWidth: number;
  viewHeight: number;
  /** Boxes for the auto-zoom, already normalized to the viewfinder rect. */
  onFrame?: (faces: DetectionBox[], persons: DetectionBox[]) => void;
  /** Handed up so the recorder can call `startRecording`/`stopRecording` on it. */
  cameraRef?: RefObject<Camera | null>;
  /** Camera and model failures, which are otherwise completely silent. */
  onProblem?: (message: string | null) => void;
  /**
   * Called before each native call the analysis makes, so a crash that takes
   * the process down still says which one it was in. See `frameTrace.ts`.
   */
  onStage?: (stage: FrameStage) => void;
}

/**
 * Live camera preview, on-device person/animal detection, and face detection
 * for the auto-zoom.
 *
 * Returns null if there's no permission or no matching device — the caller
 * (Viewfinder) falls back to the decorative standby view in that case.
 */
export function CameraFeed({
  style, active, viewWidth, viewHeight, onFrame, cameraRef, onProblem, onStage,
}: CameraFeedProps) {
  const { perms, settings, reportDetections } = useAppState();

  const cameraPosition = devicePositionFor(settings.camera);
  const device = useCameraDevice(cameraPosition, physicalDeviceFilterFor(settings.camera));

  // The recording quality setting picks the format; without this the camera
  // would record at whatever default the device chooses and the 720p/1080p/4K
  // rows would mean nothing.
  //
  // It also sets the size of the frames this component analyses: VisionCamera
  // builds the frame-processor ImageAnalysis `.forSize(format.videoSize)`, so
  // recording in 4K means downscaling 8.3 MP to 320x320 on every analysed
  // frame instead of 2.1 MP. There is no separate analysis resolution to ask
  // for in VisionCamera 4, so the cost is inherent — Setup says so rather than
  // hiding it.
  const format = useCameraFormat(device, [
    { videoResolution: qualityResolution(settings.quality) },
  ]);

  const { resize } = useResizePlugin();
  // `failed` used to be computed and thrown away, so a model both delegates
  // refused looked exactly like a working camera that never sees anything.
  const { model, failed: modelFailed } = useDetectionModel(MODEL, settings.forceCpu);

  useEffect(() => {
    if (!onProblem) return;
    onProblem(modelFailed ? 'Modèle de détection impossible à charger' : null);
  }, [modelFailed, onProblem]);

  // Recorded as soon as the camera is asked to open, because opening it is
  // itself native work: CameraX configures a session and binds an ImageAnalysis
  // use case, and a device that dies there never reaches the frame processor at
  // all. Without this, the trace such a launch leaves is empty — indistinguishable
  // from a launch that never started surveillance.
  useEffect(() => {
    // Gated on the same condition the render is: with no permission or no
    // device this component draws nothing, and blaming a camera that was never
    // opened would send the reader after the wrong failure.
    if (active && perms.cam && device != null) onStage?.('camera');
  }, [active, device, onStage, perms.cam]);

  // `autoMode` asks the plugin to scale and rotate face bounds natively against
  // the window size we hand it — passing the viewfinder's own size means bounds
  // come back in viewfinder pixels, so no rotation maths is needed on our side.
  //
  // Memoized on the values it actually contains, because `useFaceDetector`
  // memoizes on the options object's *identity*: an object literal built during
  // render made it construct a fresh native plugin — and with it a fresh ML Kit
  // FaceDetector, which nothing ever closes — on every single render, while
  // also churning `detectFaces` and so rebuilding the frame processor worklet
  // at the same rate.
  const faceDetectorOptions = useMemo(() => ({
    performanceMode: 'fast' as const,
    landmarkMode: 'none' as const,
    contourMode: 'none' as const,
    classificationMode: 'none' as const,
    minFaceSize: 0.1,
    trackingEnabled: true,
    cameraFacing: cameraPosition,
    autoMode: true,
    windowWidth: viewWidth || 1,
    windowHeight: viewHeight || 1,
  }), [cameraPosition, viewWidth, viewHeight]);
  const faceDetector = useFaceDetector(faceDetectorOptions);
  const { detectFaces } = faceDetector;

  // ML Kit's plugin registers a device-orientation listener on Android and
  // nothing in the library takes it back down; `stopListeners` is the only
  // teardown it exposes. A new plugin instance is built whenever the options
  // above change, so this runs on every one of them, not just on unmount.
  useEffect(() => faceDetector.stopListeners, [faceDetector]);

  const onJsFrame = useRunOnJS((
    detections: FrameDetection[],
    faces: DetectionBox[],
    frameAspect: number,
  ) => {
    reportDetections(detections, frameAspect);
    if (!onFrame) return;
    const persons = detections
      .filter(d => d.kind === 'Personne')
      .map(d => uprightBoxToViewBox(d.box, frameAspect, viewWidth, viewHeight));
    onFrame(faces, persons);
  }, [reportDetections, onFrame, viewWidth, viewHeight]);

  // Only the text crosses back: an Error object cannot be copied between the
  // two runtimes, and the worklet holds no `Error` we could hand over anyway.
  const onFrameError = useRunOnJS((message: string) => {
    onProblem?.(frameErrorMessage(message));
  }, [onProblem]);

  // Deliberately unconditional, and deliberately not gated on a flag the
  // worklet reads. A flag would have to be a captured value — which the
  // compiler freezes at build time — or a shared value, whose `.value` the
  // compiler hoists into a copy. Both would silently stop tracing. The cost of
  // getting it wrong is a diagnostic that lies; the cost of always hopping is
  // four cross-runtime calls per analysed frame, against a resize and an
  // inference that each take milliseconds. The JS side stops recording as soon
  // as one frame gets through (see `reportFrameStage`).
  const onFrameStage = useRunOnJS((stage: FrameStage) => {
    onStage?.(stage);
  }, [onStage]);

  const targetFps = FPS_BY_SENSITIVITY[settings.sens];
  const detectPerson = settings.person;
  const detectAnimal = settings.animal;
  const minConfidence = settings.threshold / 100;
  const autoZoom = settings.autoZoom;
  const viewW = viewWidth || 1;
  const viewH = viewHeight || 1;

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (model == null) return;

    runAtTargetFps(targetFps, () => {
      'worklet';
      runAsync(frame, () => {
        'worklet';
        // Everything analysis does per frame sits inside this `try`, because
        // outside it VisionCamera hands whatever escapes to `reportFatalError`
        // and the app closes. A failing detector is a degraded camera; it must
        // read as a message in the viewfinder, not as the app disappearing.
        try {
          // Each `onFrameStage` names the call that comes next, never the one
          // that just finished: libyuv, LiteRT and ML Kit can all end the
          // process outright, and a record of the last thing that worked names
          // everything except the culprit.
          onFrameStage('resize');
          // Feed the model the WHOLE frame, uprighted. The previous version let
          // the plugin centre-crop to a square, which threw away the sides of the
          // field of view, and left the scene rotated for a portrait-held phone.
          const resized = resize(frame, {
            crop: { x: 0, y: 0, width: frame.width, height: frame.height },
            scale: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE },
            rotation: uprightRotation(frame.orientation),
            pixelFormat: 'rgb',
            dataType: 'uint8',
          });
          onFrameStage('inference');
          // The model's 4 outputs are always float32 (see interpretDetections' doc comment).
          const outputs = model.runSync([resized]) as Float32Array[];
          const detections = interpretDetections(outputs, { detectPerson, detectAnimal, minConfidence });

          const faces: DetectionBox[] = [];
          if (autoZoom) {
            onFrameStage('faces');
            const detected = detectFaces(frame);
            for (let i = 0; i < detected.length; i++) {
              const b = detected[i].bounds;
              faces.push({ x: b.x / viewW, y: b.y / viewH, width: b.width / viewW, height: b.height / viewH });
            }
          }

          onFrameStage('report');
          onJsFrame(detections, faces, uprightAspect(frame.width, frame.height, frame.orientation));
        } catch (e) {
          // Plain property access, no `instanceof`: the worklet runtime is not
          // the one this value's prototype came from.
          const failure = e as { message?: string } | undefined;
          onFrameError(failure?.message ?? 'erreur inconnue');
        }
      });
    });
  }, [model, resize, onJsFrame, onFrameError, onFrameStage, detectFaces, autoZoom, viewW, viewH, targetFps, detectPerson, detectAnimal, minConfidence]);

  if (!perms.cam || device == null) return null;

  return (
    <Camera
      ref={cameraRef}
      style={style}
      device={device}
      format={format}
      isActive={active}
      frameProcessor={active ? frameProcessor : undefined}
      pixelFormat="yuv"
      resizeMode="cover"
      onError={error => onProblem?.(`Caméra : ${error.message}`)}
      video={true}
      // Audio is only captured once the OS microphone permission is actually
      // granted — asking the camera for audio without it aborts the recording.
      audio={perms.mic}
      videoBitRate={qualityBitRate(settings.quality)}
      lowLightBoost={settings.night && device.supportsLowLightBoost}
    />
  );
}

import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import {
  Camera, runAsync, runAtTargetFps, useCameraDevice, useFrameProcessor,
} from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { useRunOnJS } from 'react-native-worklets-core';
import { useAppState } from '../state/AppStateContext';
import { devicePositionFor, physicalDeviceFilterFor } from '../camera/deviceSelection';
import { squareBoxToViewBox } from '../camera/framing';
import { interpretDetections } from '../ml/interpretDetections';
import { DetectionBox, FrameDetection } from '../ml/types';

const MODEL = require('../../assets/models/coco-ssd-mobilenet-v1.tflite');
const MODEL_INPUT_SIZE = 300;

const FPS_BY_SENSITIVITY = { Basse: 1, Moyenne: 3, Haute: 5 } as const;

interface CameraFeedProps {
  style: StyleProp<ViewStyle>;
  active: boolean;
  /** Measured viewfinder size — face bounds come back in this space (see `autoMode` below). */
  viewWidth: number;
  viewHeight: number;
  /** Boxes for the auto-zoom, already normalized to the viewfinder rect. */
  onFrame?: (faces: DetectionBox[], persons: DetectionBox[]) => void;
}

/**
 * Live camera preview, on-device person/animal detection, and face detection
 * for the auto-zoom.
 *
 * Returns null if there's no permission or no matching device — the caller
 * (Viewfinder) falls back to the decorative standby view in that case.
 */
export function CameraFeed({ style, active, viewWidth, viewHeight, onFrame }: CameraFeedProps) {
  const { perms, settings, reportDetections } = useAppState();

  const device = useCameraDevice(
    devicePositionFor(settings.camera),
    physicalDeviceFilterFor(settings.camera),
  );

  const { resize } = useResizePlugin();
  const modelState = useTensorflowModel(MODEL);
  const model = modelState.state === 'loaded' ? modelState.model : undefined;

  // `autoMode` asks the plugin to scale and rotate face bounds natively against
  // the window size we hand it — passing the viewfinder's own size means bounds
  // come back in viewfinder pixels, so no rotation maths is needed on our side.
  const { detectFaces } = useFaceDetector({
    performanceMode: 'fast',
    landmarkMode: 'none',
    contourMode: 'none',
    classificationMode: 'none',
    minFaceSize: 0.1,
    trackingEnabled: true,
    cameraFacing: devicePositionFor(settings.camera),
    autoMode: true,
    windowWidth: viewWidth || 1,
    windowHeight: viewHeight || 1,
  });

  const onJsFrame = useRunOnJS((detections: FrameDetection[], faces: DetectionBox[]) => {
    reportDetections(detections);
    if (!onFrame) return;
    const persons = detections
      .filter(d => d.kind === 'Personne')
      .map(d => squareBoxToViewBox(d.box, viewWidth, viewHeight));
    onFrame(faces, persons);
  }, [reportDetections, onFrame, viewWidth, viewHeight]);

  const targetFps = FPS_BY_SENSITIVITY[settings.sens];
  const detectPerson = settings.person;
  const detectAnimal = settings.animal;
  const minConfidence = settings.threshold / 100;
  const autoZoom = settings.autoZoom;
  const frameW = viewWidth || 1;
  const frameH = viewHeight || 1;

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (model == null) return;

    runAtTargetFps(targetFps, () => {
      'worklet';
      runAsync(frame, () => {
        'worklet';
        const resized = resize(frame, {
          scale: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE },
          pixelFormat: 'rgb',
          dataType: 'uint8',
        });
        // The model's 4 outputs are always float32 (see interpretDetections' doc comment).
        const outputs = model.runSync([resized]) as Float32Array[];
        const detections = interpretDetections(outputs, { detectPerson, detectAnimal, minConfidence });

        const faces: DetectionBox[] = [];
        if (autoZoom) {
          const detected = detectFaces(frame);
          for (let i = 0; i < detected.length; i++) {
            const b = detected[i].bounds;
            faces.push({
              x: b.x / frameW,
              y: b.y / frameH,
              width: b.width / frameW,
              height: b.height / frameH,
            });
          }
        }

        onJsFrame(detections, faces);
      });
    });
  }, [model, resize, onJsFrame, detectFaces, autoZoom, frameW, frameH, targetFps, detectPerson, detectAnimal, minConfidence]);

  if (!perms.cam || device == null) return null;

  return (
    <Camera
      style={style}
      device={device}
      isActive={active}
      frameProcessor={active ? frameProcessor : undefined}
      pixelFormat="yuv"
      resizeMode="cover"
    />
  );
}

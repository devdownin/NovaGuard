import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import {
  Camera, runAsync, runAtTargetFps, useCameraDevice, useFrameProcessor,
} from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useRunOnJS } from 'react-native-worklets-core';
import { useAppState } from '../state/AppStateContext';
import { devicePositionFor, physicalDeviceFilterFor } from '../camera/deviceSelection';
import { interpretDetections } from '../ml/interpretDetections';

const MODEL = require('../../assets/models/coco-ssd-mobilenet-v1.tflite');
const MODEL_INPUT_SIZE = 300;

const FPS_BY_SENSITIVITY = { Basse: 1, Moyenne: 3, Haute: 5 } as const;

interface CameraFeedProps {
  style: StyleProp<ViewStyle>;
  active: boolean;
}

/**
 * Live camera preview + on-device person/animal detection.
 * Returns null if there's no permission or no matching device — the caller
 * (Viewfinder) falls back to the decorative standby view in that case.
 */
export function CameraFeed({ style, active }: CameraFeedProps) {
  const { perms, settings, reportDetections } = useAppState();

  const device = useCameraDevice(
    devicePositionFor(settings.camera),
    physicalDeviceFilterFor(settings.camera),
  );

  const { resize } = useResizePlugin();
  const modelState = useTensorflowModel(MODEL);
  const model = modelState.state === 'loaded' ? modelState.model : undefined;

  const reportOnJS = useRunOnJS(reportDetections, [reportDetections]);

  const targetFps = FPS_BY_SENSITIVITY[settings.sens];
  const detectPerson = settings.person;
  const detectAnimal = settings.animal;
  const minConfidence = settings.threshold / 100;

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
        reportOnJS(detections);
      });
    });
  }, [model, resize, reportOnJS, targetFps, detectPerson, detectAnimal, minConfidence]);

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

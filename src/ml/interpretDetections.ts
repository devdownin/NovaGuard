import { ANIMAL_LABELS, COCO_LABELS, PERSON_LABELS } from './labels';
import { FrameDetection } from './types';

export interface InterpretOptions {
  detectPerson: boolean;
  detectAnimal: boolean;
  /** 0–1 */
  minConfidence: number;
}

/**
 * Decodes the 4 output tensors of the bundled detection model
 * (efficientdet-lite0.tflite). Verified against the model file itself:
 *   [0] locations  — [1, N, 4] normalized (yMin, xMin, yMax, xMax) per box
 *   [1] classes    — [1, N] float class index into COCO_LABELS
 *   [2] scores     — [1, N] float confidence, 0–1
 *   [3] numDetections — [1] float, how many of the N slots are valid
 * (N is 25 for this model; the code reads it from the tensors rather than
 * assuming, so a model swap does not silently truncate detections.)
 * This 4-output order is fixed by the postprocessing op baked into the
 * model file, not something this app controls. The TFLite_Detection_PostProcess
 * op always emits float32 tensors here regardless of the model's quantized input,
 * so these are plain Float32Arrays (react-native-fast-tflite's TypedArray union
 * also covers Int/BigInt variants that don't apply to this model's outputs).
 *
 * Boxes come out normalized to the uprighted full frame.
 *
 * Runs on the camera's frame-processor thread — must stay a worklet.
 */
export function interpretDetections(outputs: Float32Array[], options: InterpretOptions): FrameDetection[] {
  'worklet';

  const locations = outputs[0];
  const classes = outputs[1];
  const scores = outputs[2];
  const numDetections = outputs[3];

  const count = Math.min(Math.round(numDetections[0] ?? 0), scores.length);
  const results: FrameDetection[] = [];

  for (let i = 0; i < count; i++) {
    const confidence = scores[i];
    if (confidence == null || confidence < options.minConfidence) continue;

    const label = COCO_LABELS[Math.round(classes[i])] ?? '???';
    let kind: FrameDetection['kind'] | null = null;
    if (options.detectPerson && PERSON_LABELS.has(label)) kind = 'Personne';
    else if (options.detectAnimal && ANIMAL_LABELS.has(label)) kind = 'Animal';
    if (kind == null) continue;

    const o = i * 4;
    const yMin = locations[o];
    const xMin = locations[o + 1];
    const yMax = locations[o + 2];
    const xMax = locations[o + 3];

    results.push({
      kind,
      confidence,
      box: {
        x: Math.max(0, Math.min(1, xMin)),
        y: Math.max(0, Math.min(1, yMin)),
        width: Math.max(0, Math.min(1, xMax - xMin)),
        height: Math.max(0, Math.min(1, yMax - yMin)),
      },
    });
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

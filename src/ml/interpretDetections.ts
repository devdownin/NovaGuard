import { KIND_BY_CLASS_INDEX } from './labels';
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
/** Worklet-safe: a local helper, not a closure over anything outside. */
function clamp01(value: number): number {
  'worklet';
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

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

    // Indexed lookup, not a label string: the class index is what the model
    // emits, and a computed access is also the only member access the worklets
    // compiler carries into the closure whole (see `KIND_BY_CLASS_INDEX`).
    // An out-of-range or NaN index reads back undefined, which is the same
    // "not a kind we record" answer as an ignored class.
    const kind = KIND_BY_CLASS_INDEX[Math.round(classes[i])];
    if (kind == null) continue;
    if (kind === 'Personne' ? !options.detectPerson : !options.detectAnimal) continue;

    const o = i * 4;
    // Clamp the corners, then derive the size from them. Clamping the origin
    // and the size independently — which this did — inflates any box the model
    // pushes past the frame edge, and edges are where surveillance subjects
    // live. A person entering at xMin -0.08, xMax 0.25 came out 0.33 wide
    // instead of 0.25, and one leaving at xMax 1.14 produced a box reaching 14%
    // of the frame beyond its own right edge.
    const yMin = clamp01(locations[o]);
    const xMin = clamp01(locations[o + 1]);
    const yMax = clamp01(locations[o + 2]);
    const xMax = clamp01(locations[o + 3]);

    results.push({
      kind,
      confidence,
      box: {
        x: xMin,
        y: yMin,
        width: Math.max(0, xMax - xMin),
        height: Math.max(0, yMax - yMin),
      },
    });
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

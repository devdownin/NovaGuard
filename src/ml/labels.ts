// COCO 90-class label map bundled with assets/models/coco-ssd-mobilenet-v1.tflite
// (Google's "SSD MobileNet V1" quantized model, coco_ssd_mobilenet_v1_1.0_quant).
// Index-aligned with the model's "classes" output tensor, including the
// reserved "???" placeholder slots the model's own labelmap.txt ships with —
// do not compact this array.
export const COCO_LABELS = [
  '???', 'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', '???', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', '???', 'backpack',
  'umbrella', '???', '???', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard',
  'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
  'tennis racket', 'bottle', '???', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl',
  'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut',
  'cake', 'chair', 'couch', 'potted plant', 'bed', '???', 'dining table', '???', '???', 'toilet',
  '???', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven',
  'toaster', 'sink', 'refrigerator', '???', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
  'hair drier', 'toothbrush',
] as const;

export const PERSON_LABELS: ReadonlySet<string> = new Set(['person']);

// COCO doesn't have an "animal" superclass — these are its individual animal classes.
export const ANIMAL_LABELS: ReadonlySet<string> = new Set([
  'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe',
]);

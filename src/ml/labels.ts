// COCO label map extracted from the bundled model's own metadata
// (assets/models/efficientdet-lite0.tflite → labelmap.txt).
//
// NOTE: unlike the older SSD MobileNet label file, this one is 0-indexed on
// 'person' — there is no leading '???' placeholder. Swapping models without
// swapping this array shifts every class by one and silently kills detection.
export const COCO_LABELS = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus',
  'train', 'truck', 'boat', 'traffic light', 'fire hydrant', '???',
  'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog',
  'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
  'giraffe', '???', 'backpack', 'umbrella', '???', '???',
  'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard',
  'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
  'tennis racket', 'bottle', '???', 'wine glass', 'cup', 'fork',
  'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich',
  'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut',
  'cake', 'chair', 'couch', 'potted plant', 'bed', '???',
  'dining table', '???', '???', 'toilet', '???', 'tv',
  'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave',
  'oven', 'toaster', 'sink', 'refrigerator', '???', 'book',
  'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush',
] as const;

export const PERSON_LABELS: ReadonlySet<string> = new Set(['person']);

// COCO has no "animal" superclass — these are its individual animal classes.
export const ANIMAL_LABELS: ReadonlySet<string> = new Set([
  'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe',
]);

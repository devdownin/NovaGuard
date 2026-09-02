import { DetectionBox } from '../ml/types';

/**
 * Geometry for the cinematic auto-zoom.
 *
 * Everything here is pure and unit-tested (`__tests__/framing.test.ts`) — it is
 * the one part of the auto-zoom that can be verified without a device.
 *
 * Coordinate spaces:
 * - "square space": normalized 0–1 inside the centered square crop the TFLite
 *   model is fed (what `interpretDetections` returns).
 * - "view space": normalized 0–1 inside the viewfinder rect, which is what the
 *   overlay draws in and what the zoom transform operates on.
 */

export interface Framing {
  scale: number;
  translateX: number;
  translateY: number;
}

export const NEUTRAL_FRAMING: Framing = { scale: 1, translateX: 0, translateY: 0 };

/** Union of several boxes; null if the list is empty. */
export function unionBox(boxes: DetectionBox[]): DetectionBox | null {
  if (boxes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Converts a box normalized to the (uprighted) camera frame into a box
 * normalized to the viewfinder rect.
 *
 * The preview renders with `resizeMode="cover"`, so the frame is scaled until
 * it covers the view and the excess on the long axis is cropped evenly at both
 * ends — this reproduces exactly that, which is why the overlay and the zoom
 * always agree with what is actually on screen.
 */
export function uprightBoxToViewBox(
  box: DetectionBox,
  frameAspect: number,
  viewW: number,
  viewH: number,
): DetectionBox {
  if (viewW <= 0 || viewH <= 0 || frameAspect <= 0) return box;
  const ratio = frameAspect / (viewW / viewH);

  if (ratio > 1) {
    // Frame is wider than the view: full height shown, sides cropped.
    return {
      x: (box.x - 0.5) * ratio + 0.5,
      y: box.y,
      width: box.width * ratio,
      height: box.height,
    };
  }
  // Frame is taller than the view: full width shown, top and bottom cropped.
  return {
    x: box.x,
    y: (box.y - 0.5) / ratio + 0.5,
    width: box.width,
    height: box.height / ratio,
  };
}

/** Grows a box by `ratio` of its size on every side, clamped to 0–1. */
export function padBox(box: DetectionBox, ratio: number): DetectionBox {
  const dx = box.width * ratio;
  const dy = box.height * ratio;
  const x = Math.max(0, box.x - dx);
  const y = Math.max(0, box.y - dy);
  return {
    x,
    y,
    width: Math.min(1 - x, box.width + dx * 2),
    height: Math.min(1 - y, box.height + dy * 2),
  };
}

/** Exponential moving average between two boxes — damps per-frame jitter. */
export function smoothBox(previous: DetectionBox | null, next: DetectionBox, alpha: number): DetectionBox {
  if (!previous) return next;
  const mix = (a: number, b: number) => a + (b - a) * alpha;
  return {
    x: mix(previous.x, next.x),
    y: mix(previous.y, next.y),
    width: mix(previous.width, next.width),
    height: mix(previous.height, next.height),
  };
}

export interface FramingOptions {
  /** Fraction of the view the target should occupy once framed (0–1). */
  coverage: number;
  /** Upper bound on magnification — caps how soft the digital zoom can get. */
  maxScale: number;
}

/**
 * Framing transform that centers `target` (view-space) and magnifies it to the
 * requested coverage.
 *
 * The pan is clamped so the scaled preview always covers the viewfinder: at
 * scale s the image overhangs by (s-1)/2 of the view on each side, so that is
 * exactly how far it may travel before an edge would come into view.
 */
export function computeFraming(
  target: DetectionBox,
  viewW: number,
  viewH: number,
  { coverage, maxScale }: FramingOptions,
): Framing {
  if (viewW <= 0 || viewH <= 0 || target.width <= 0 || target.height <= 0) {
    return NEUTRAL_FRAMING;
  }

  const rawScale = Math.min(coverage / target.width, coverage / target.height);
  const scale = Math.min(Math.max(rawScale, 1), maxScale);

  // Target centre, as an offset from the view centre, in px.
  const offsetX = (target.x + target.width / 2 - 0.5) * viewW;
  const offsetY = (target.y + target.height / 2 - 0.5) * viewH;

  const maxPanX = ((scale - 1) * viewW) / 2;
  const maxPanY = ((scale - 1) * viewH) / 2;

  return {
    scale,
    translateX: clamp(-scale * offsetX, -maxPanX, maxPanX),
    translateY: clamp(-scale * offsetY, -maxPanY, maxPanY),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

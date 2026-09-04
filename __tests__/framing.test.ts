/**
 * @format
 */

import {
  boxInZoomedFrame,
  computeFraming, maxZoomKeepingInFrame, NEUTRAL_FRAMING, padBox, smoothBox, unionBox,
} from '../src/camera/framing';

const VIEW_W = 360;
const VIEW_H = 560;

describe('unionBox', () => {
  it('returns null for an empty list', () => {
    expect(unionBox([])).toBeNull();
  });

  it('wraps every box', () => {
    const union = unionBox([
      { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
      { x: 0.5, y: 0.1, width: 0.2, height: 0.4 },
    ]);
    expect(union).toEqual({ x: 0.1, y: 0.1, width: 0.6, height: 0.4 });
  });
});

describe('padBox', () => {
  it('grows the box on every side', () => {
    const box = padBox({ x: 0.4, y: 0.4, width: 0.2, height: 0.2 }, 0.5);
    expect(box.x).toBeCloseTo(0.3);
    expect(box.y).toBeCloseTo(0.3);
    expect(box.width).toBeCloseTo(0.4);
    expect(box.height).toBeCloseTo(0.4);
  });

  it('never leaves the 0–1 range', () => {
    const box = padBox({ x: 0.05, y: 0.9, width: 0.2, height: 0.2 }, 1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1);
    expect(box.y + box.height).toBeLessThanOrEqual(1);
  });
});

describe('smoothBox', () => {
  it('passes the first sample through untouched', () => {
    const next = { x: 0.1, y: 0.1, width: 0.3, height: 0.3 };
    expect(smoothBox(null, next, 0.25)).toBe(next);
  });

  it('moves only part of the way towards the new sample', () => {
    const previous = { x: 0, y: 0, width: 0.2, height: 0.2 };
    const next = { x: 1, y: 1, width: 0.2, height: 0.2 };
    expect(smoothBox(previous, next, 0.25).x).toBeCloseTo(0.25);
  });

  it('converges on the target after repeated samples', () => {
    const target = { x: 0.8, y: 0.8, width: 0.2, height: 0.2 };
    let box = { x: 0, y: 0, width: 0.2, height: 0.2 };
    for (let i = 0; i < 60; i++) box = smoothBox(box, target, 0.25);
    expect(box.x).toBeCloseTo(0.8, 3);
  });
});

/**
 * The capture zoom is the only magnification that reaches the recorded file —
 * a React Native transform scales the preview view and nothing else. It is also
 * a centre crop with no pan, which is the whole difficulty.
 */
describe('maxZoomKeepingInFrame', () => {
  it('lets a centred subject zoom as far as it likes', () => {
    const centred = { x: 0.45, y: 0.45, width: 0.1, height: 0.1 };
    // Furthest edge is 0.05 from centre, so the crop may shrink to a tenth.
    expect(maxZoomKeepingInFrame(centred)).toBeCloseTo(10);
  });

  it('refuses to zoom at all on a subject against the edge', () => {
    // Cropping here would remove exactly the thing being recorded.
    expect(maxZoomKeepingInFrame({ x: 0, y: 0.4, width: 0.2, height: 0.2 })).toBe(1);
    expect(maxZoomKeepingInFrame({ x: 0.4, y: 0.8, width: 0.2, height: 0.2 })).toBe(1);
  });

  it('is bounded by whichever axis runs out first', () => {
    // Comfortable horizontally, close to the top edge: the vertical axis decides.
    const tall = { x: 0.45, y: 0.05, width: 0.1, height: 0.1 };
    expect(maxZoomKeepingInFrame(tall)).toBeCloseTo(0.5 / 0.45);
  });

  it('never answers below 1, which would mean zooming out past the sensor', () => {
    expect(maxZoomKeepingInFrame({ x: 0, y: 0, width: 1, height: 1 })).toBe(1);
    expect(maxZoomKeepingInFrame({ x: -0.2, y: 0.4, width: 0.3, height: 0.2 })).toBe(1);
  });

  it('holds: the box stays inside the crop at the zoom it returns', () => {
    const boxes = [
      { x: 0.45, y: 0.45, width: 0.1, height: 0.1 },
      { x: 0.2, y: 0.3, width: 0.15, height: 0.25 },
      { x: 0.62, y: 0.1, width: 0.2, height: 0.3 },
    ];
    for (const box of boxes) {
      const zoom = Math.min(maxZoomKeepingInFrame(box), 50);
      const visible = { from: 0.5 - 1 / (2 * zoom), to: 0.5 + 1 / (2 * zoom) };
      // The property the whole bound exists for, checked rather than assumed.
      expect(box.x).toBeGreaterThanOrEqual(visible.from - 1e-9);
      expect(box.y).toBeGreaterThanOrEqual(visible.from - 1e-9);
      expect(box.x + box.width).toBeLessThanOrEqual(visible.to + 1e-9);
      expect(box.y + box.height).toBeLessThanOrEqual(visible.to + 1e-9);
    }
  });
});

describe('boxInZoomedFrame', () => {
  it('leaves the box alone at 1x', () => {
    const box = { x: 0.3, y: 0.4, width: 0.2, height: 0.1 };
    expect(boxInZoomedFrame(box, 1)).toEqual(box);
  });

  it('grows the box by the factor the camera already applied', () => {
    const centred = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };
    const zoomed = boxInZoomedFrame(centred, 2);
    expect(zoomed.x).toBeCloseTo(0.3);
    expect(zoomed.y).toBeCloseTo(0.3);
    expect(zoomed.width).toBeCloseTo(0.4);
    expect(zoomed.height).toBeCloseTo(0.4);
  });

  it('pushes an off-centre box further out, as a centre crop does', () => {
    const left = { x: 0.1, y: 0.45, width: 0.1, height: 0.1 };
    const zoomed = boxInZoomedFrame(left, 2);
    // It was 0.35 left of centre; at 2x the crop makes that 0.7.
    expect(zoomed.x + zoomed.width / 2).toBeCloseTo(0.5 - 0.7);
  });

  it('composes with computeFraming instead of multiplying with it', () => {
    const target = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };
    const options = { coverage: 0.8, maxScale: 8 };
    const withoutCameraZoom = computeFraming(target, 400, 400, options);

    // Half the magnification done by the camera; the transform must ask for the
    // other half, so that camera x transform lands back on the same total.
    const cameraZoom = 2;
    const residual = computeFraming(boxInZoomedFrame(target, cameraZoom), 400, 400, options);

    expect(residual.scale * cameraZoom).toBeCloseTo(withoutCameraZoom.scale);
  });
});

describe('computeFraming', () => {
  const opts = { coverage: 0.45, maxScale: 2.8 };

  it('is neutral for a degenerate target', () => {
    expect(computeFraming({ x: 0, y: 0, width: 0, height: 0 }, VIEW_W, VIEW_H, opts))
      .toEqual(NEUTRAL_FRAMING);
  });

  it('is neutral before the view has been measured', () => {
    expect(computeFraming({ x: 0.4, y: 0.4, width: 0.1, height: 0.1 }, 0, 0, opts))
      .toEqual(NEUTRAL_FRAMING);
  });

  it('never zooms out below 1x, even for a target larger than the coverage', () => {
    const { scale } = computeFraming({ x: 0, y: 0, width: 1, height: 1 }, VIEW_W, VIEW_H, opts);
    expect(scale).toBe(1);
  });

  it('caps magnification at maxScale for a tiny target', () => {
    const { scale } = computeFraming({ x: 0.49, y: 0.49, width: 0.02, height: 0.02 }, VIEW_W, VIEW_H, opts);
    expect(scale).toBe(opts.maxScale);
  });

  it('magnifies a small target towards the requested coverage', () => {
    const { scale } = computeFraming({ x: 0.4, y: 0.4, width: 0.2, height: 0.2 }, VIEW_W, VIEW_H, opts);
    expect(scale).toBeCloseTo(0.45 / 0.2);
  });

  it('needs no pan for a centred target', () => {
    const { translateX, translateY } = computeFraming(
      { x: 0.4, y: 0.4, width: 0.2, height: 0.2 }, VIEW_W, VIEW_H, opts,
    );
    expect(translateX).toBeCloseTo(0);
    expect(translateY).toBeCloseTo(0);
  });

  it('pans towards an off-centre target', () => {
    // Target sits left of centre, so the image must slide right (positive X).
    const { translateX } = computeFraming(
      { x: 0.1, y: 0.4, width: 0.2, height: 0.2 }, VIEW_W, VIEW_H, opts,
    );
    expect(translateX).toBeGreaterThan(0);
  });

  it('never pans far enough to expose an edge', () => {
    // A tiny target in the extreme corner asks for far more pan than is allowed.
    const { scale, translateX, translateY } = computeFraming(
      { x: 0, y: 0, width: 0.03, height: 0.03 }, VIEW_W, VIEW_H, opts,
    );
    expect(Math.abs(translateX)).toBeLessThanOrEqual(((scale - 1) * VIEW_W) / 2 + 1e-9);
    expect(Math.abs(translateY)).toBeLessThanOrEqual(((scale - 1) * VIEW_H) / 2 + 1e-9);
  });

  it('has no pan to clamp when it is not zoomed in', () => {
    const { scale, translateX, translateY } = computeFraming(
      { x: 0, y: 0, width: 1, height: 1 }, VIEW_W, VIEW_H, opts,
    );
    expect(scale).toBe(1);
    expect(translateX).toBeCloseTo(0);
    expect(translateY).toBeCloseTo(0);
  });
});

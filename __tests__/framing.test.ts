/**
 * @format
 */

import {
  computeFraming, NEUTRAL_FRAMING, padBox, smoothBox, squareBoxToViewBox, unionBox,
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

describe('squareBoxToViewBox', () => {
  it('letterboxes the square crop inside a portrait view', () => {
    // Portrait view: the square is full width, vertically centred.
    const box = squareBoxToViewBox({ x: 0, y: 0, width: 1, height: 1 }, VIEW_W, VIEW_H);
    expect(box.x).toBeCloseTo(0);
    expect(box.width).toBeCloseTo(1);
    expect(box.y).toBeCloseTo((VIEW_H - VIEW_W) / 2 / VIEW_H);
    expect(box.height).toBeCloseTo(VIEW_W / VIEW_H);
  });

  it('keeps a centred box centred', () => {
    const box = squareBoxToViewBox({ x: 0.4, y: 0.4, width: 0.2, height: 0.2 }, VIEW_W, VIEW_H);
    expect(box.x + box.width / 2).toBeCloseTo(0.5);
    expect(box.y + box.height / 2).toBeCloseTo(0.5);
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

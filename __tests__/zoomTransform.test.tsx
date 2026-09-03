/**
 * That the cinematic move actually drives the transform, with the right numbers.
 *
 * `autoZoom.test.tsx` covers the phases and their timing; `framing.test.ts` and
 * `orientation.test.ts` cover the geometry. Nothing covered the seam: the hook
 * could sequence every phase perfectly and hand the animation a framing for the
 * wrong corner of the screen, and the whole suite would stay green.
 *
 * The values cannot be read back. The transform animates on the native driver —
 * which is the point, so inference cannot stutter it — and under Jest the JS
 * copy of an `Animated.Value` driven that way never moves: `__getValue()`
 * answers 1 / 0 / 0 from mount to teardown, whatever the animation did. What
 * the hook asks for is observable, though, so that is what this asserts.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Animated } from 'react-native';
import {
  BODY_ZOOM_OUT_MS, FACE_HOLD_MS, FACE_ZOOM_IN_MS, RELEASE_MS, useAutoZoom,
} from '../src/camera/useAutoZoom';
import { DetectionBox } from '../src/ml/types';

const VIEW_W = 360;
const VIEW_H = 640;

/** Left of centre and high up — a face, where a standing person's head is. */
const FACE_LEFT: DetectionBox = { x: 0.15, y: 0.10, width: 0.16, height: 0.16 };
/** Right of centre, for the mirrored case. */
const FACE_RIGHT: DetectionBox = { x: 0.69, y: 0.10, width: 0.16, height: 0.16 };
const BODY: DetectionBox = { x: 0.30, y: 0.20, width: 0.40, height: 0.70 };

const T0 = 1_780_000_000_000;

interface Move {
  scale: number;
  translateX: number;
  translateY: number;
  duration: number;
}

interface Harness {
  zoom: ReturnType<typeof useAutoZoom>;
  /** Every completed move the hook asked for, oldest first. */
  moves: () => Move[];
}

/**
 * Mounts the hook with `Animated.timing` under a spy.
 *
 * The spy calls through, so the real animation still runs — this only records
 * what each of the three channels was asked to reach, and in how long.
 */
function mount({ enabled = true } = {}): Harness {
  const timing = jest.spyOn(Animated, 'timing');
  const box = {} as { zoom: ReturnType<typeof useAutoZoom> };

  function Probe({ on }: { on: boolean }) {
    box.zoom = useAutoZoom({ enabled: on, viewWidth: VIEW_W, viewHeight: VIEW_H });
    return null;
  }
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => { tree = ReactTestRenderer.create(<Probe on={enabled} />); });

  const moves = () => {
    const out: Move[] = [];
    // The three channels are always started together, in one parallel group.
    for (let i = 0; i < timing.mock.calls.length; i += 3) {
      const group = timing.mock.calls.slice(i, i + 3);
      if (group.length < 3) break;
      const byChannel = new Map<unknown, { toValue: number; duration: number }>();
      for (const [value, config] of group) {
        byChannel.set(value, {
          toValue: config.toValue as number,
          duration: (config as { duration: number }).duration,
        });
      }
      const s = byChannel.get(box.zoom.scale)!;
      out.push({
        scale: s.toValue,
        translateX: byChannel.get(box.zoom.translateX)!.toValue,
        translateY: byChannel.get(box.zoom.translateY)!.toValue,
        duration: s.duration,
      });
    }
    return out;
  };

  return Object.assign(box as Harness, {
    moves,
    setEnabled: (on: boolean) => {
      ReactTestRenderer.act(() => { tree.update(<Probe on={on} />); });
    },
  }) as Harness & { setEnabled: (on: boolean) => void };
}

/** One report from the frame processor, at wall-clock `at`. */
function report(h: Harness, at: number, faces: DetectionBox[], persons: DetectionBox[]) {
  jest.setSystemTime(T0 + at);
  ReactTestRenderer.act(() => { h.zoom.submitFrame(faces, persons); });
}

/** Two sightings, which is the streak a close-up needs. */
function seeFace(h: Harness, face: DetectionBox) {
  report(h, 0, [face], [BODY]);
  report(h, 200, [face], [BODY]);
}

function wait(ms: number) {
  ReactTestRenderer.act(() => { jest.advanceTimersByTime(ms); });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(T0);
  jest.restoreAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('magnifies when it eases into a face', () => {
  const h = mount();
  seeFace(h, FACE_LEFT);

  const [move] = h.moves();
  // A "close-up" that does not magnify is the failure this cannot detect from
  // phases alone: the machine would report `face` either way.
  expect(move.scale).toBeGreaterThan(1);
  expect(move.duration).toBe(FACE_ZOOM_IN_MS);
});

it('pans towards the subject rather than away from it', () => {
  const left = mount();
  seeFace(left, FACE_LEFT);
  const leftMove = left.moves()[0];

  jest.restoreAllMocks();
  const right = mount();
  seeFace(right, FACE_RIGHT);
  const rightMove = right.moves()[0];

  // A face left of centre has to be brought right, and vice versa. A sign error
  // here frames the opposite corner of the screen — and every phase and every
  // geometry test still passes, because neither looks at the two together.
  expect(leftMove.translateX).toBeGreaterThan(0);
  expect(rightMove.translateX).toBeLessThan(0);
  // Both faces sit high in the frame, so both pull the image down.
  expect(leftMove.translateY).toBeGreaterThan(0);
  expect(rightMove.translateY).toBeGreaterThan(0);
});

it('never pans far enough to expose an edge', () => {
  const h = mount();
  seeFace(h, FACE_LEFT);
  wait(FACE_ZOOM_IN_MS + FACE_HOLD_MS);        // through to the wide shot
  report(h, 6000, [], [BODY]);

  for (const move of h.moves()) {
    // At scale s the image overhangs the view by (s-1)/2 on each side; panning
    // past that slides the frame's own border into shot.
    const maxX = ((move.scale - 1) * VIEW_W) / 2;
    const maxY = ((move.scale - 1) * VIEW_H) / 2;
    expect(Math.abs(move.translateX)).toBeLessThanOrEqual(maxX + 1e-6);
    expect(Math.abs(move.translateY)).toBeLessThanOrEqual(maxY + 1e-6);
  }
});

it('pulls back to a wider shot than the close-up, without zooming out past 1x', () => {
  const h = mount();
  seeFace(h, FACE_LEFT);
  const closeUp = h.moves()[0];

  wait(FACE_ZOOM_IN_MS + FACE_HOLD_MS);
  const wide = h.moves()[h.moves().length - 1];

  expect(wide.duration).toBe(BODY_ZOOM_OUT_MS);
  // The whole point of the move: the wide shot shows more than the close-up.
  expect(wide.scale).toBeLessThan(closeUp.scale);
  // But it is still a framing, not a zoom-out — 1x is the floor.
  expect(wide.scale).toBeGreaterThanOrEqual(1);
});

it('returns the transform to neutral when the subject is gone', () => {
  const h = mount();
  seeFace(h, FACE_LEFT);
  report(h, 400, [], []);
  wait(FACE_HOLD_MS);       // past the lost grace period

  const last = h.moves()[h.moves().length - 1];
  // Anything short of exactly neutral leaves the preview permanently cropped.
  expect(last).toMatchObject({ scale: 1, translateX: 0, translateY: 0 });
});

it('releases the zoom when the setting is switched off mid-move', () => {
  const h = mount() as Harness & { setEnabled: (on: boolean) => void };
  seeFace(h, FACE_LEFT);
  expect(h.zoom.phase).toBe('face');

  h.setEnabled(false);

  // Consuming the setting, not just storing it: a switch that leaves the
  // preview cropped on a face is a switch that did nothing.
  expect(h.zoom.phase).toBe('idle');
  const last = h.moves()[h.moves().length - 1];
  expect(last).toMatchObject({ scale: 1, translateX: 0, translateY: 0 });
  expect(last.duration).toBe(RELEASE_MS);
});

it('moves all three channels as one gesture', () => {
  const h = mount();
  seeFace(h, FACE_LEFT);
  wait(FACE_ZOOM_IN_MS + FACE_HOLD_MS);

  // Recorded per move by construction above; this pins the reason it holds —
  // three channels on three durations is a wobble, not a camera move.
  const timing = Animated.timing as unknown as jest.SpyInstance;
  const durations = timing.mock.calls.map(([, config]) => (config as { duration: number }).duration);
  for (let i = 0; i < durations.length; i += 3) {
    expect(new Set(durations.slice(i, i + 3)).size).toBe(1);
  }
});

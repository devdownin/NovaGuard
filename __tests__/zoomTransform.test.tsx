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
/** Dead centre, where a centre crop can magnify furthest. */
const FACE_CENTRED: DetectionBox = { x: 0.42, y: 0.42, width: 0.16, height: 0.16 };
/** Hard against the left edge: a centre crop cannot magnify this at all. */
const FACE_AT_EDGE: DetectionBox = { x: 0, y: 0.42, width: 0.16, height: 0.16 };

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
function mount({ enabled = true, maxCameraZoom = 1 } = {}): Harness {
  const timing = jest.spyOn(Animated, 'timing');
  const box = {} as { zoom: ReturnType<typeof useAutoZoom> };

  function Probe({ on }: { on: boolean }) {
    box.zoom = useAutoZoom({ enabled: on, viewWidth: VIEW_W, viewHeight: VIEW_H, maxCameraZoom });
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

/**
 * The magnification the recorded file actually receives.
 *
 * A React Native transform scales the preview view; the encoder sits downstream
 * of the capture session and never sees it. Only `<Camera zoom>` reaches the
 * file — and it is a centre crop with no pan, which is what makes this delicate
 * rather than a one-line change.
 */
describe('the zoom that reaches the recording', () => {
  it('leaves the capture alone while the move is still running', () => {
    const h = mount({ maxCameraZoom: 8 });
    seeFace(h, FACE_CENTRED);

    // Changing it mid-move would jump the preview: the transform is animating
    // towards a framing computed against the field of view it started from.
    expect(h.zoom.cameraZoom).toBe(1);
  });

  it('hands the magnification to the sensor once the preview has arrived', () => {
    const h = mount({ maxCameraZoom: 8 });
    seeFace(h, FACE_CENTRED);
    wait(FACE_ZOOM_IN_MS);

    // Without this the close-up exists only on screen, which is the whole
    // complaint this answers.
    expect(h.zoom.cameraZoom).toBeGreaterThan(1);
  });

  it('gives back exactly what it took, so the preview does not jump', () => {
    const h = mount({ maxCameraZoom: 8 });
    seeFace(h, FACE_CENTRED);
    const asked = h.moves()[h.moves().length - 1].scale;

    wait(FACE_ZOOM_IN_MS);

    // Read off the value rather than the animation: the hand-over is a `setValue`
    // in the same commit as the zoom, deliberately not an animation — there is
    // nothing to animate, since the product must not change at all.
    const residual = (h.zoom.scale as unknown as { __getValue: () => number }).__getValue();
    expect(h.zoom.cameraZoom).toBeGreaterThan(1);
    // The product is what the viewer sees. The transform shrinks by exactly the
    // factor the sensor gained, so the screen shows nothing happen.
    expect(residual * h.zoom.cameraZoom).toBeCloseTo(asked, 3);
  });

  it('refuses to crop a subject out of the recording to zoom in on it', () => {
    const h = mount({ maxCameraZoom: 8 });
    // Hard against the left edge. A centre crop at the scale the preview uses
    // would put this face entirely outside the recorded frame — on a
    // surveillance camera, losing the only thing worth recording.
    seeFace(h, FACE_AT_EDGE);
    wait(FACE_ZOOM_IN_MS);

    expect(h.zoom.cameraZoom).toBe(1);
    // The preview still frames them, because its transform can pan.
    expect(h.moves()[0].scale).toBeGreaterThan(1);
  });

  it('never asks for more than the device can do', () => {
    const h = mount({ maxCameraZoom: 1.5 });
    seeFace(h, FACE_CENTRED);
    wait(FACE_ZOOM_IN_MS);

    expect(h.zoom.cameraZoom).toBeLessThanOrEqual(1.5);
  });

  it('stays at 1 on a device that cannot zoom, with the preview unaffected', () => {
    const h = mount();   // maxCameraZoom defaults to 1
    seeFace(h, FACE_CENTRED);
    wait(FACE_ZOOM_IN_MS);

    expect(h.zoom.cameraZoom).toBe(1);
    expect(h.moves()[0].scale).toBeGreaterThan(1);
  });

  it('gives the sensor back its full field of view when the subject leaves', () => {
    const h = mount({ maxCameraZoom: 8 });
    seeFace(h, FACE_CENTRED);
    wait(FACE_ZOOM_IN_MS);
    expect(h.zoom.cameraZoom).toBeGreaterThan(1);

    report(h, 400, [], []);
    wait(FACE_HOLD_MS);

    // Anything else leaves the camera permanently cropped, recording a slice of
    // the room it was pointed at.
    expect(h.zoom.cameraZoom).toBe(1);
  });

  it('releases the capture when the setting is switched off mid-move', () => {
    const h = mount({ maxCameraZoom: 8 }) as Harness & { setEnabled: (on: boolean) => void };
    seeFace(h, FACE_CENTRED);
    wait(FACE_ZOOM_IN_MS);
    expect(h.zoom.cameraZoom).toBeGreaterThan(1);

    h.setEnabled(false);

    expect(h.zoom.cameraZoom).toBe(1);
  });
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

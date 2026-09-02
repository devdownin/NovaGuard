/**
 * The cinematic move's timing, driven through the real state machine.
 *
 * The framing maths has its own tests (`framing.test.ts`); what this covers is
 * the part that was wrong — how long each phase is allowed to last.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  BODY_DWELL_MS, BODY_ZOOM_OUT_MS, FACE_HOLD_MS, FACE_ZOOM_IN_MS, FULL_CYCLE_MS,
  RETRIGGER_COOLDOWN_MS, useAutoZoom, ZoomPhase,
} from '../src/camera/useAutoZoom';
import { DetectionBox } from '../src/ml/types';

const FACE: DetectionBox = { x: 0.4, y: 0.25, width: 0.2, height: 0.2 };
const BODY: DetectionBox = { x: 0.3, y: 0.2, width: 0.4, height: 0.7 };

/** A plausible epoch: the retrigger check reads Date.now() against 0. */
const T0 = 1_780_000_000_000;

interface Harness {
  phase?: ZoomPhase;
  submit?: (faces: DetectionBox[], persons: DetectionBox[]) => void;
}

function mount(): Harness {
  const harness: Harness = {};
  function Probe() {
    const zoom = useAutoZoom({ enabled: true, viewWidth: 360, viewHeight: 640 });
    harness.phase = zoom.phase;
    harness.submit = zoom.submitFrame;
    return null;
  }
  ReactTestRenderer.act(() => { ReactTestRenderer.create(<Probe />); });
  return harness;
}

/** One report from the frame processor, at wall-clock `at`. */
function report(h: Harness, at: number, faces = [FACE], persons = [BODY]) {
  jest.setSystemTime(T0 + at);
  ReactTestRenderer.act(() => { h.submit!(faces, persons); });
}

function wait(ms: number) {
  ReactTestRenderer.act(() => { jest.advanceTimersByTime(ms); });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(T0);
});
afterEach(() => { jest.useRealTimers(); });

describe('timing constants', () => {
  it('never lets a new close-up interrupt the pull-back', () => {
    // The invariant the whole feature rests on. A literal 6000 here — which is
    // what shipped — is shorter than the 7000 ms cycle, so the wide shot was
    // cut off partway and never actually appeared.
    expect(RETRIGGER_COOLDOWN_MS).toBeGreaterThanOrEqual(FULL_CYCLE_MS);
  });

  it('leaves the wide shot up long enough to be read', () => {
    expect(RETRIGGER_COOLDOWN_MS - FULL_CYCLE_MS).toBe(BODY_DWELL_MS);
    expect(BODY_DWELL_MS).toBeGreaterThan(BODY_ZOOM_OUT_MS / 2);
  });
});

describe('the move, with someone standing in frame', () => {
  it('eases into the face, holds, then pulls back to the whole person', () => {
    const h = mount();

    report(h, 0);
    expect(h.phase).toBe('idle');   // one sighting is not a streak
    report(h, 200);
    expect(h.phase).toBe('face');

    wait(FACE_ZOOM_IN_MS + FACE_HOLD_MS);
    expect(h.phase).toBe('body');
  });

  it('holds the wide shot past the end of the pull-back', () => {
    const h = mount();
    report(h, 0);
    report(h, 200);
    wait(FACE_ZOOM_IN_MS + FACE_HOLD_MS);

    // The subject stays, so faces keep arriving all the way through.
    for (let t = 5600; t <= FULL_CYCLE_MS + BODY_DWELL_MS - 200; t += 200) {
      report(h, t);
      expect(h.phase).toBe('body');
    }
  });

  it('is allowed to start over once the wide shot has had its turn', () => {
    const h = mount();
    report(h, 0);
    report(h, 200);
    wait(FACE_ZOOM_IN_MS + FACE_HOLD_MS);

    report(h, RETRIGGER_COOLDOWN_MS + 400);
    expect(h.phase).toBe('face');
  });
});

describe('when the subject leaves', () => {
  it('returns to the full frame', () => {
    const h = mount();
    report(h, 0);
    report(h, 200);
    expect(h.phase).toBe('face');

    report(h, 400, [], []);
    wait(5000);                      // past the lost-grace window
    expect(h.phase).toBe('idle');
  });
});

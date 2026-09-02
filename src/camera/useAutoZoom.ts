import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { DetectionBox } from '../ml/types';
import {
  computeFraming, Framing, NEUTRAL_FRAMING, padBox, smoothBox, unionBox,
} from './framing';

export type ZoomPhase = 'idle' | 'face' | 'body';

/** Slow, deliberate moves — the point is that the camera never snaps. */
export const FACE_ZOOM_IN_MS = 1400;
export const FACE_HOLD_MS = 4000;
export const BODY_ZOOM_OUT_MS = 1600;
export const RELEASE_MS = 1200;
/** Re-framing while already holding a subject: softer still, so it reads as drift. */
const FOLLOW_MS = 700;

/** Consecutive reports a face must appear in before a move is triggered. */
const FACE_TRIGGER_STREAK = 2;
/** How long everything must stay empty before we pull back to the full frame. */
const LOST_GRACE_MS = 1800;
/** How long the wide shot is left alone once it lands, so it can be read. */
export const BODY_DWELL_MS = 2500;

/** Face zoom in, hold, pull back out — the whole move, end to end. */
export const FULL_CYCLE_MS = FACE_ZOOM_IN_MS + FACE_HOLD_MS + BODY_ZOOM_OUT_MS;

/**
 * Keeps a second face from yanking the camera straight back into a close-up.
 *
 * Derived rather than picked: a literal shorter than {@link FULL_CYCLE_MS} lets
 * a new close-up interrupt the pull-back before it has finished, so the wide
 * shot of the whole person — the entire point of the move — is never reached.
 * That is exactly what a hardcoded 6000 did here: it cut the 1600 ms pull-back
 * at roughly 600 ms and then looped, forever, while anyone stood in frame.
 */
export const RETRIGGER_COOLDOWN_MS = FULL_CYCLE_MS + BODY_DWELL_MS;

const TARGET_SMOOTHING = 0.35;
const FACE_COVERAGE = 0.45;
const FACE_MAX_SCALE = 2.8;
const BODY_COVERAGE = 0.8;
const BODY_MAX_SCALE = 2;
// Enough headroom to keep hair and some shoulders in shot; much more than this
// and the padded box gets so wide that the close-up barely magnifies at all.
const FACE_PADDING = 0.25;
const BODY_PADDING = 0.12;

/** Ignore re-frames smaller than this — micro-corrections are what make a zoom feel twitchy. */
const SCALE_EPSILON = 0.08;
const PAN_EPSILON = 0.06;

const EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

interface AutoZoomParams {
  enabled: boolean;
  viewWidth: number;
  viewHeight: number;
}

export interface AutoZoom {
  scale: Animated.Value;
  translateX: Animated.Value;
  translateY: Animated.Value;
  phase: ZoomPhase;
  /** Fed from the frame-processor callback on the JS thread. Boxes are view-space normalized. */
  submitFrame: (faces: DetectionBox[], persons: DetectionBox[]) => void;
}

/**
 * Drives a slow "look closer, then pull back" camera move: when a face shows up
 * it eases into a head-and-shoulders framing, holds it for {@link FACE_HOLD_MS},
 * then eases out to frame the whole person(s), and finally releases to the full
 * frame once the subject is gone.
 *
 * The transform animates on the native driver, so inference work on the JS and
 * frame-processor threads cannot stutter the movement.
 */
export function useAutoZoom({ enabled, viewWidth, viewHeight }: AutoZoomParams): AutoZoom {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const [phase, setPhase] = useState<ZoomPhase>('idle');
  const phaseRef = useRef<ZoomPhase>('idle');

  const currentFraming = useRef<Framing>(NEUTRAL_FRAMING);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const smoothedFace = useRef<DetectionBox | null>(null);
  const smoothedBody = useRef<DetectionBox | null>(null);
  const faceStreak = useRef(0);
  const lastFaceZoomAt = useRef(0);

  const clearTimers = useCallback(() => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (lostTimer.current) { clearTimeout(lostTimer.current); lostTimer.current = null; }
  }, []);

  const setPhaseBoth = useCallback((next: ZoomPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const animateTo = useCallback((target: Framing, duration: number) => {
    animation.current?.stop();
    currentFraming.current = target;
    // One parallel group, one duration, one easing curve — the three channels
    // have to move as a single gesture or the result reads as a wobble.
    animation.current = Animated.parallel([
      Animated.timing(scale, { toValue: target.scale, duration, easing: EASING, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: target.translateX, duration, easing: EASING, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: target.translateY, duration, easing: EASING, useNativeDriver: true }),
    ]);
    animation.current.start();
  }, [scale, translateX, translateY]);

  const release = useCallback((duration = RELEASE_MS) => {
    clearTimers();
    smoothedFace.current = null;
    smoothedBody.current = null;
    faceStreak.current = 0;
    setPhaseBoth('idle');
    animateTo(NEUTRAL_FRAMING, duration);
  }, [animateTo, clearTimers, setPhaseBoth]);

  const isWorthMoving = useCallback((next: Framing) => {
    const previous = currentFraming.current;
    return (
      Math.abs(next.scale - previous.scale) > SCALE_EPSILON ||
      Math.abs(next.translateX - previous.translateX) > PAN_EPSILON * viewWidth ||
      Math.abs(next.translateY - previous.translateY) > PAN_EPSILON * viewHeight
    );
  }, [viewWidth, viewHeight]);

  const goToBody = useCallback(() => {
    holdTimer.current = null;
    const body = smoothedBody.current;
    if (!body) {
      release(BODY_ZOOM_OUT_MS);
      return;
    }
    setPhaseBoth('body');
    animateTo(
      computeFraming(padBox(body, BODY_PADDING), viewWidth, viewHeight, {
        coverage: BODY_COVERAGE, maxScale: BODY_MAX_SCALE,
      }),
      BODY_ZOOM_OUT_MS,
    );
  }, [animateTo, release, setPhaseBoth, viewWidth, viewHeight]);

  const submitFrame = useCallback((faces: DetectionBox[], persons: DetectionBox[]) => {
    if (!enabled || viewWidth <= 0 || viewHeight <= 0) return;

    const face = unionBox(faces);
    const body = unionBox(persons);

    if (face) smoothedFace.current = smoothBox(smoothedFace.current, face, TARGET_SMOOTHING);
    if (body) smoothedBody.current = smoothBox(smoothedBody.current, body, TARGET_SMOOTHING);

    const hasSubject = !!face || !!body;

    if (hasSubject && lostTimer.current) {
      clearTimeout(lostTimer.current);
      lostTimer.current = null;
    }
    if (!hasSubject) {
      faceStreak.current = 0;
      if (phaseRef.current !== 'idle' && !lostTimer.current) {
        lostTimer.current = setTimeout(() => { lostTimer.current = null; release(); }, LOST_GRACE_MS);
      }
      return;
    }

    faceStreak.current = face ? faceStreak.current + 1 : 0;

    const canStartFaceZoom =
      face &&
      faceStreak.current >= FACE_TRIGGER_STREAK &&
      phaseRef.current !== 'face' &&
      !holdTimer.current &&
      Date.now() - lastFaceZoomAt.current > RETRIGGER_COOLDOWN_MS;

    if (canStartFaceZoom) {
      lastFaceZoomAt.current = Date.now();
      setPhaseBoth('face');
      animateTo(
        computeFraming(padBox(smoothedFace.current!, FACE_PADDING), viewWidth, viewHeight, {
          coverage: FACE_COVERAGE, maxScale: FACE_MAX_SCALE,
        }),
        FACE_ZOOM_IN_MS,
      );
      holdTimer.current = setTimeout(goToBody, FACE_HOLD_MS + FACE_ZOOM_IN_MS);
      return;
    }

    // Already framed on something: drift with the subject rather than re-zooming.
    if (phaseRef.current === 'face' && smoothedFace.current) {
      const next = computeFraming(padBox(smoothedFace.current, FACE_PADDING), viewWidth, viewHeight, {
        coverage: FACE_COVERAGE, maxScale: FACE_MAX_SCALE,
      });
      if (isWorthMoving(next)) animateTo(next, FOLLOW_MS);
    } else if (phaseRef.current === 'body' && smoothedBody.current) {
      const next = computeFraming(padBox(smoothedBody.current, BODY_PADDING), viewWidth, viewHeight, {
        coverage: BODY_COVERAGE, maxScale: BODY_MAX_SCALE,
      });
      if (isWorthMoving(next)) animateTo(next, FOLLOW_MS);
    }
  }, [animateTo, enabled, goToBody, isWorthMoving, release, setPhaseBoth, viewWidth, viewHeight]);

  // Turning the feature off (or unmounting) must not leave the preview zoomed.
  useEffect(() => {
    if (!enabled) release(RELEASE_MS);
  }, [enabled, release]);

  useEffect(() => () => {
    animation.current?.stop();
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (lostTimer.current) clearTimeout(lostTimer.current);
  }, []);

  return useMemo(
    () => ({ scale, translateX, translateY, phase, submitFrame }),
    [scale, translateX, translateY, phase, submitFrame],
  );
}

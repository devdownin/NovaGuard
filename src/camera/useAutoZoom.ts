import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { DetectionBox } from '../ml/types';
import {
  boxInZoomedFrame, captureZoomFor, computeFraming, Framing, FramingOptions,
  NEUTRAL_FRAMING, padBox, smoothBox, unionBox,
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
/** Below this, handing magnification to the sensor buys nothing and costs a session change. */
const ZOOM_EPSILON = 0.05;

const PAN_EPSILON = 0.06;

const FACE_FRAMING: FramingOptions = { coverage: FACE_COVERAGE, maxScale: FACE_MAX_SCALE };
const BODY_FRAMING: FramingOptions = { coverage: BODY_COVERAGE, maxScale: BODY_MAX_SCALE };

const EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

interface AutoZoomParams {
  enabled: boolean;
  viewWidth: number;
  viewHeight: number;
  /**
   * Furthest the capture session can zoom on this device (`device.maxZoom`).
   * 1 — the default — means the camera does not zoom and only the preview moves.
   */
  maxCameraZoom?: number;
}

export interface AutoZoom {
  scale: Animated.Value;
  translateX: Animated.Value;
  translateY: Animated.Value;
  /**
   * Zoom factor for `<Camera zoom>` — the only magnification that reaches the
   * recorded file. A view transform scales the preview and nothing else.
   */
  cameraZoom: number;
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
export function useAutoZoom({
  enabled, viewWidth, viewHeight, maxCameraZoom = 1,
}: AutoZoomParams): AutoZoom {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const [phase, setPhase] = useState<ZoomPhase>('idle');
  const phaseRef = useRef<ZoomPhase>('idle');

  /**
   * What the capture is zoomed to right now.
   *
   * Changed only when a move has finished, never during one. `<Camera zoom>`
   * is a native session property and this project has no Reanimated, so the
   * only way to animate it would be a prop update per displayed frame — in an
   * app built around not re-rendering the viewfinder subtree at all. Stepping
   * it once the transform has arrived keeps the preview continuous, because
   * the two are changed in the same commit and their product is unchanged: the
   * viewer sees nothing, and the recording gains the close-up for the hold.
   */
  const [cameraZoom, setCameraZoom] = useState(1);
  const cameraZoomRef = useRef(1);

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

  const animateTo = useCallback((target: Framing, duration: number, onArrived?: () => void) => {
    animation.current?.stop();
    currentFraming.current = target;
    // One parallel group, one duration, one easing curve — the three channels
    // have to move as a single gesture or the result reads as a wobble.
    animation.current = Animated.parallel([
      Animated.timing(scale, { toValue: target.scale, duration, easing: EASING, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: target.translateX, duration, easing: EASING, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: target.translateY, duration, easing: EASING, useNativeDriver: true }),
    ]);
    // Only on arrival: a move cut short by the next one must not hand a framing
    // to the sensor that the preview never actually reached.
    animation.current.start(({ finished }) => { if (finished) onArrived?.(); });
  }, [scale, translateX, translateY]);

  /** Puts the three channels exactly where they are told, with no animation. */
  const snapTo = useCallback((target: Framing) => {
    animation.current?.stop();
    currentFraming.current = target;
    scale.setValue(target.scale);
    translateX.setValue(target.translateX);
    translateY.setValue(target.translateY);
  }, [scale, translateX, translateY]);

  /**
   * Hands as much of the magnification as it safely can to the capture session.
   *
   * This is what puts the move in the recorded file: a view transform scales
   * the preview and nothing else. `<Camera zoom>` crops the sensor about its
   * centre with no pan, so how far it may go is bounded by the subject's own
   * position — see `maxZoomKeepingInFrame`. Whatever is left over stays with
   * the transform, which can pan and therefore still frames the subject.
   *
   * Both are changed in the same commit and their product is unchanged, so the
   * viewer sees nothing happen. `box` is in the current, already-cropped frame,
   * so everything here is relative to the zoom in force.
   */
  const handToCamera = useCallback((
    framed: DetectionBox, tracked: DetectionBox, options: FramingOptions,
  ) => {
    const wanted = computeFraming(framed, viewWidth, viewHeight, options).scale;
    const headroom = maxCameraZoom / cameraZoomRef.current;
    // `tracked` is the raw detection the tracker compares; `framed` the padded
    // box the framing uses. The two bounds are not interchangeable — see
    // `captureZoomFor`, which is where the decision lives so it can be swept.
    const extra = captureZoomFor(framed, tracked, wanted, headroom);
    if (!(extra > 1 + ZOOM_EPSILON)) return;

    cameraZoomRef.current *= extra;
    setCameraZoom(cameraZoomRef.current);
    snapTo(computeFraming(boxInZoomedFrame(framed, extra), viewWidth, viewHeight, options));
  }, [maxCameraZoom, snapTo, viewWidth, viewHeight]);

  /**
   * Takes the magnification back off the sensor without the preview moving.
   *
   * Widening the capture makes the frame jump outwards at once, so the
   * transform has to absorb exactly what the sensor gives up in the same
   * commit. The framing computed against the box in the *full* frame is that
   * value: residual x cameraZoom is the total, which is what `computeFraming`
   * on the un-cropped box returns.
   */
  const releaseCamera = useCallback((box: DetectionBox | null, options: FramingOptions) => {
    const zoom = cameraZoomRef.current;
    if (zoom <= 1) return;
    cameraZoomRef.current = 1;
    setCameraZoom(1);
    if (!box) return;
    snapTo(computeFraming(boxInZoomedFrame(box, 1 / zoom), viewWidth, viewHeight, options));
  }, [snapTo, viewWidth, viewHeight]);

  const release = useCallback((duration = RELEASE_MS) => {
    clearTimers();
    // Off the sensor first, and against whatever it was framing: the transform
    // absorbs it in the same commit, then eases the whole thing out from there.
    releaseCamera(
      smoothedFace.current ?? smoothedBody.current,
      phaseRef.current === 'body' ? BODY_FRAMING : FACE_FRAMING,
    );
    smoothedFace.current = null;
    smoothedBody.current = null;
    faceStreak.current = 0;
    setPhaseBoth('idle');
    animateTo(NEUTRAL_FRAMING, duration);
  }, [animateTo, clearTimers, releaseCamera, setPhaseBoth]);

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
    // Widening: the sensor gives its crop back first, so the pull-back starts
    // from the full field of view and the wide shot is genuinely wide — in the
    // file as much as on screen.
    releaseCamera(smoothedFace.current ?? body, FACE_FRAMING);
    const tracked = smoothedBody.current ?? body;
    const framed = padBox(tracked, BODY_PADDING);
    animateTo(
      computeFraming(framed, viewWidth, viewHeight, BODY_FRAMING),
      BODY_ZOOM_OUT_MS,
      () => handToCamera(framed, tracked, BODY_FRAMING),
    );
  }, [animateTo, handToCamera, release, releaseCamera, setPhaseBoth, viewWidth, viewHeight]);

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
      const framed = padBox(smoothedFace.current!, FACE_PADDING);
      const tracked = smoothedFace.current!;
      animateTo(
        computeFraming(framed, viewWidth, viewHeight, FACE_FRAMING),
        FACE_ZOOM_IN_MS,
        // Only once the preview has arrived: the sensor then holds the close-up
        // for the whole hold, which is what puts it in the recording.
        () => handToCamera(framed, tracked, FACE_FRAMING),
      );
      holdTimer.current = setTimeout(goToBody, FACE_HOLD_MS + FACE_ZOOM_IN_MS);
      return;
    }

    // Already framed on something: drift with the subject rather than re-zooming.
    if (phaseRef.current === 'face' && smoothedFace.current) {
      const next = computeFraming(padBox(smoothedFace.current, FACE_PADDING), viewWidth, viewHeight, FACE_FRAMING);
      if (isWorthMoving(next)) animateTo(next, FOLLOW_MS);
    } else if (phaseRef.current === 'body' && smoothedBody.current) {
      const next = computeFraming(padBox(smoothedBody.current, BODY_PADDING), viewWidth, viewHeight, BODY_FRAMING);
      if (isWorthMoving(next)) animateTo(next, FOLLOW_MS);
    }
  }, [animateTo, enabled, goToBody, handToCamera, isWorthMoving, release, setPhaseBoth, viewWidth, viewHeight]);

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
    () => ({ scale, translateX, translateY, cameraZoom, phase, submitFrame }),
    [scale, translateX, translateY, cameraZoom, phase, submitFrame],
  );
}

import { DetectionKind } from '../state/types';
import { DetectionBox, FrameDetection } from './types';

/**
 * Small IoU tracker sitting between the raw per-frame detections and the app.
 *
 * Without it, a single lucky frame above the confidence threshold opens a
 * recording session (and writes a history event), while a person briefly
 * occluded splits one passage into two events. Tracks fix both ends: a subject
 * has to be seen `confirmAfter` frames running before it counts, and survives
 * `dropAfterMs` of not being seen before it is let go.
 */

export interface Track {
  id: number;
  kind: DetectionKind;
  /** Latest box, normalized to the uprighted frame. */
  box: DetectionBox;
  confidence: number;
  maxConfidence: number;
  hits: number;
  misses: number;
  confirmed: boolean;
  firstSeen: number;
  lastSeen: number;
}

export interface TrackerOptions {
  /** Minimum overlap for a detection to continue an existing track. */
  iouThreshold: number;
  /**
   * Consecutive hits before a track is trusted. Counted in frames on purpose:
   * this guards against a single spurious detection, and "corroborated by the
   * next look" is a claim about looks, not about elapsed time.
   */
  confirmAfter: number;
  /**
   * How long a track may go unseen before it is dropped, in milliseconds.
   *
   * Time, not frames. This one is a claim about the world — someone stepping
   * behind a pillar is hidden for about a second whatever rate we analyse at —
   * and counting frames made it mean 3 s at "Basse" (1 fps) and 0.6 s at
   * "Haute" (5 fps), so the sensitivity setting silently rescaled how tolerant
   * the tracker was of occlusion.
   */
  dropAfterMs: number;
}

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  iouThreshold: 0.25,
  confirmAfter: 2,
  dropAfterMs: 1200,
};

export function iou(a: DetectionBox, b: DetectionBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return 0;
  const overlap = w * h;
  const union = a.width * a.height + b.width * b.height - overlap;
  return union > 0 ? overlap / union : 0;
}

let nextId = 1;

/** Only exported so tests can make ids deterministic. */
export function resetTrackIds(): void {
  nextId = 1;
}

/**
 * Advances the track list by one frame. Pure apart from the id counter:
 * the input tracks are never mutated.
 */
export function updateTracks(
  tracks: Track[],
  detections: FrameDetection[],
  now: number,
  options: TrackerOptions = DEFAULT_TRACKER_OPTIONS,
): Track[] {
  // Greedy association, best overlap first, and only within the same kind —
  // a dog walking over where a person stood should not inherit their track.
  const pairs: { t: number; d: number; score: number }[] = [];
  tracks.forEach((track, t) => {
    detections.forEach((detection, d) => {
      if (detection.kind !== track.kind) return;
      const score = iou(track.box, detection.box);
      if (score >= options.iouThreshold) pairs.push({ t, d, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score);

  const takenTracks = new Set<number>();
  const takenDetections = new Set<number>();
  const matches = new Map<number, number>();
  for (const pair of pairs) {
    if (takenTracks.has(pair.t) || takenDetections.has(pair.d)) continue;
    takenTracks.add(pair.t);
    takenDetections.add(pair.d);
    matches.set(pair.t, pair.d);
  }

  const next: Track[] = [];

  tracks.forEach((track, t) => {
    const d = matches.get(t);
    if (d === undefined) {
      if (now - track.lastSeen < options.dropAfterMs) {
        next.push({ ...track, misses: track.misses + 1 });
      }
      return;
    }
    const detection = detections[d];
    const hits = track.hits + 1;
    next.push({
      ...track,
      box: detection.box,
      confidence: detection.confidence,
      maxConfidence: Math.max(track.maxConfidence, detection.confidence),
      hits,
      misses: 0,
      confirmed: track.confirmed || hits >= options.confirmAfter,
      lastSeen: now,
    });
  });

  detections.forEach((detection, d) => {
    if (takenDetections.has(d)) return;
    next.push({
      id: nextId++,
      kind: detection.kind,
      box: detection.box,
      confidence: detection.confidence,
      maxConfidence: detection.confidence,
      hits: 1,
      misses: 0,
      confirmed: options.confirmAfter <= 1,
      firstSeen: now,
      lastSeen: now,
    });
  });

  return next;
}

/**
 * The subjects the app should act on: everything confirmed and not yet dropped.
 *
 * Deliberately does *not* exclude tracks with a miss on the current frame. It
 * used to, which quietly cancelled the tracker's own occlusion tolerance for
 * everything downstream: one missed detection made the overlay box vanish and
 * `primaryTrack` return null, so the box flickered and the recording's
 * post-roll timer started against a subject that was still there. A track is
 * live until `updateTracks` lets it go — that is what `dropAfterMs` is for.
 */
export function confirmedTracks(tracks: Track[]): Track[] {
  return tracks.filter(t => t.confirmed);
}

/**
 * True when two confirmed-track lists would draw the same overlay.
 *
 * Confidence is compared as the whole percent the label actually shows: the raw
 * float wobbles on every frame for a subject standing still, and treating that
 * as a change forces a redraw that alters no pixel. Boxes are compared exactly —
 * they are positioned at full precision. `kind` needs no check: a track's kind
 * is fixed at creation and `updateTracks` only matches within a kind, so an
 * equal id already implies an equal kind.
 */
export function sameVisibleTracks(a: Track[], b: Track[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      Math.round(x.confidence * 100) !== Math.round(y.confidence * 100) ||
      x.box.x !== y.box.x || x.box.y !== y.box.y ||
      x.box.width !== y.box.width || x.box.height !== y.box.height
    ) return false;
  }
  return true;
}

/**
 * The track the UI treats as the subject: highest confidence among confirmed.
 *
 * Walks the list directly rather than going through `confirmedTracks`, which
 * allocated a filtered array per call to produce a single element — on a path
 * the frame processor hits several times a second.
 */
export function primaryTrack(tracks: Track[]): Track | null {
  let best: Track | null = null;
  for (const t of tracks) {
    if (!t.confirmed) continue;
    if (!best || t.confidence > best.confidence) best = t;
  }
  return best;
}

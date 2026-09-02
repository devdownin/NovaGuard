import { DetectionKind } from '../state/types';
import { DetectionBox, FrameDetection } from './types';

/**
 * Small IoU tracker sitting between the raw per-frame detections and the app.
 *
 * Without it, a single lucky frame above the confidence threshold opens a
 * recording session (and writes a history event), while a person briefly
 * occluded splits one passage into two events. Tracks fix both ends: a subject
 * has to be seen `confirmAfter` frames running before it counts, and survives
 * `dropAfter` empty frames before it is let go.
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
  /** Consecutive hits before a track is trusted. */
  confirmAfter: number;
  /** Consecutive misses before a track is dropped. */
  dropAfter: number;
}

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  iouThreshold: 0.25,
  confirmAfter: 2,
  dropAfter: 3,
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
      const misses = track.misses + 1;
      if (misses < options.dropAfter) next.push({ ...track, misses });
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

export function confirmedTracks(tracks: Track[]): Track[] {
  return tracks.filter(t => t.confirmed && t.misses === 0);
}

/** The track the UI treats as the subject: highest confidence among confirmed. */
export function primaryTrack(tracks: Track[]): Track | null {
  let best: Track | null = null;
  for (const t of confirmedTracks(tracks)) {
    if (!best || t.confidence > best.confidence) best = t;
  }
  return best;
}

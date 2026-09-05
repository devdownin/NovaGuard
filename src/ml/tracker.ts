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
  /**
   * Centre velocity in frame widths (and heights) per millisecond, smoothed.
   * Zero until the subject has been seen twice, so a fresh track never predicts.
   */
  vx: number;
  vy: number;
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
  /**
   * Score a detection must reach to *open* a track — the user's "seuil de
   * confiance". Anything weaker may only continue a track that already exists.
   *
   * This is the whole point of splitting the threshold in two. A detector at
   * 320 px scores a subject at the far end of a garden, or half in shadow, in
   * the 0.4–0.6 range and wobbles across any single line drawn through it; used
   * as one gate, the line either misses those subjects entirely or turns every
   * flicker of noise into a recording. Used as an *entry* gate, with a low floor
   * feeding association (`floorConfidence` in `interpretDetections`), a strong
   * look opens the track and the weak ones keep it alive.
   */
  startConfidence: number;
  /**
   * How far a subject's centre may travel between two looks, as a multiple of
   * its own diagonal, and still be recognised once the boxes no longer overlap.
   *
   * Overlap alone cannot follow anybody at these rates. At 3 fps a person
   * walking across the field of view moves further than their own width between
   * frames, so `iou` reads 0, the track is abandoned and its replacement needs
   * `confirmAfter` looks to be trusted — by which point it has moved again. At
   * "Basse" (1 fps) that is every passage that is not a subject standing still:
   * the app filmed people who stopped and missed people who walked past.
   */
  maxTravel: number;
}

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  iouThreshold: 0.25,
  confirmAfter: 2,
  dropAfterMs: 1200,
  startConfidence: 0.6,
  maxTravel: 1,
};

/** How much of a new velocity estimate to believe. One noisy box must not fling the prediction. */
const VELOCITY_SMOOTHING = 0.5;

/**
 * A subject does not change size abruptly between two looks; two different
 * people crossing paths do. Bounds the size ratio a proximity match will accept.
 */
const MIN_SIZE_RATIO = 0.5;
const MAX_SIZE_RATIO = 2;

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

/**
 * Where a track's box should be by `now`, given how it was last moving.
 *
 * Used for association only — never for the box the overlay draws or the
 * recording is framed on, which stay the last thing actually seen. A prediction
 * on screen would be the app drawing a subject where nobody is.
 */
export function predictedBox(track: Track, now: number): DetectionBox {
  const dt = now - track.lastSeen;
  if (dt <= 0 || (track.vx === 0 && track.vy === 0)) return track.box;
  return {
    x: track.box.x + track.vx * dt,
    y: track.box.y + track.vy * dt,
    width: track.box.width,
    height: track.box.height,
  };
}

/**
 * How well `detection` continues a track whose predicted position is `predicted`,
 * when the two do not overlap at all. 0 when it does not, at all.
 *
 * Kept strictly below 1 so that in the greedy pass any real overlap — scored
 * `1 + iou` — outranks every proximity match, whatever their distances.
 */
function proximityScore(predicted: DetectionBox, detection: DetectionBox, maxTravel: number): number {
  const area = predicted.width * predicted.height;
  const detectedArea = detection.width * detection.height;
  if (area <= 0 || detectedArea <= 0) return 0;
  const ratio = detectedArea / area;
  if (ratio < MIN_SIZE_RATIO || ratio > MAX_SIZE_RATIO) return 0;

  const dx = detection.x + detection.width / 2 - (predicted.x + predicted.width / 2);
  const dy = detection.y + detection.height / 2 - (predicted.y + predicted.height / 2);
  const reach = Math.sqrt(predicted.width * predicted.width + predicted.height * predicted.height) * maxTravel;
  if (reach <= 0) return 0;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < reach ? 1 - distance / reach : 0;
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
  // Greedy association, best score first, and only within the same kind — a dog
  // walking over where a person stood should not inherit their track. Matching
  // is done against where each track is *predicted* to be, so a subject that
  // moved a long way since the last look is still recognised at the far end of
  // that movement rather than at the near one.
  const predicted = tracks.map(track => predictedBox(track, now));
  const pairs: { t: number; d: number; score: number }[] = [];
  tracks.forEach((track, t) => {
    detections.forEach((detection, d) => {
      if (detection.kind !== track.kind) return;
      const overlap = iou(predicted[t], detection.box);
      const score = overlap >= options.iouThreshold
        ? 1 + overlap
        : proximityScore(predicted[t], detection.box, options.maxTravel);
      if (score > 0) pairs.push({ t, d, score });
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
    const dt = now - track.lastSeen;
    // Measured against the last box actually seen, not the predicted one: the
    // prediction is already built from this velocity, so estimating the next
    // one from it would compound its own error.
    const moved = dt > 0;
    const stepX = moved ? (detection.box.x + detection.box.width / 2
      - (track.box.x + track.box.width / 2)) / dt : 0;
    const stepY = moved ? (detection.box.y + detection.box.height / 2
      - (track.box.y + track.box.height / 2)) / dt : 0;
    next.push({
      ...track,
      box: detection.box,
      confidence: detection.confidence,
      maxConfidence: Math.max(track.maxConfidence, detection.confidence),
      vx: moved ? track.vx + (stepX - track.vx) * VELOCITY_SMOOTHING : track.vx,
      vy: moved ? track.vy + (stepY - track.vy) * VELOCITY_SMOOTHING : track.vy,
      hits,
      misses: 0,
      confirmed: track.confirmed || hits >= options.confirmAfter,
      lastSeen: now,
    });
  });

  detections.forEach((detection, d) => {
    if (takenDetections.has(d)) return;
    // A weak detection may keep a track alive but never start one: an unmatched
    // box below the user's threshold is, as far as this app can tell, noise.
    if (detection.confidence < options.startConfidence) return;
    next.push({
      id: nextId++,
      kind: detection.kind,
      box: detection.box,
      confidence: detection.confidence,
      maxConfidence: detection.confidence,
      vx: 0,
      vy: 0,
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
 * equal id already implies an equal kind. Velocity is not compared either: it is
 * an association aid, and nothing on screen is drawn from it.
 */
function sameTrack(x: Track, y: Track): boolean {
  return (
    x.id === y.id &&
    Math.round(x.confidence * 100) === Math.round(y.confidence * 100) &&
    x.box.x === y.box.x && x.box.y === y.box.y &&
    x.box.width === y.box.width && x.box.height === y.box.height
  );
}

export function sameVisibleTracks(a: Track[], b: Track[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!sameTrack(a[i], b[i])) return false;
  return true;
}

/**
 * The confirmed tracks, reusing `previous` when the overlay would not change.
 *
 * `confirmedTracks(next)` allocated a filtered array on every analysed frame
 * only for the comparison to throw it away again — which is the garbage the
 * identity check was added to remove, moved one level down. This walks `next`
 * once and allocates nothing at all unless something actually moved, so an
 * empty scene or a motionless subject costs a single pass and no array.
 */
export function confirmedTracksIfChanged(previous: Track[], tracks: Track[]): Track[] {
  let seen = 0;
  for (const track of tracks) {
    if (!track.confirmed) continue;
    const before = previous[seen];
    if (before === undefined || !sameTrack(before, track)) return confirmedTracks(tracks);
    seen++;
  }
  // A track that left is a change too, even though every survivor matched.
  return seen === previous.length ? previous : confirmedTracks(tracks);
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

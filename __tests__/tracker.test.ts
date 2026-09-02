/**
 * @format
 */

import {
  confirmedTracks, DEFAULT_TRACKER_OPTIONS, iou, primaryTrack, resetTrackIds, Track, updateTracks,
} from '../src/ml/tracker';
import { FrameDetection } from '../src/ml/types';

const box = (x: number, y: number, w = 0.2, h = 0.4) => ({ x, y, width: w, height: h });
const person = (x: number, y = 0.3, confidence = 0.9): FrameDetection =>
  ({ kind: 'Personne', confidence, box: box(x, y) });
const animal = (x: number, confidence = 0.9): FrameDetection =>
  ({ kind: 'Animal', confidence, box: box(x, 0.3) });

beforeEach(resetTrackIds);

describe('iou', () => {
  it('is 1 for identical boxes', () => {
    expect(iou(box(0.1, 0.1), box(0.1, 0.1))).toBeCloseTo(1);
  });

  it('is 0 for disjoint boxes', () => {
    expect(iou(box(0, 0), box(0.9, 0.9))).toBe(0);
  });

  it('is between 0 and 1 for partial overlap', () => {
    const value = iou(box(0, 0), box(0.1, 0));
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });
});

describe('updateTracks', () => {
  it('creates an unconfirmed track on first sight', () => {
    const tracks = updateTracks([], [person(0.3)], 1000);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].confirmed).toBe(false);
    expect(confirmedTracks(tracks)).toHaveLength(0);
  });

  it('confirms only after the required streak — a one-frame blip never counts', () => {
    let tracks = updateTracks([], [person(0.3)], 1000);
    expect(confirmedTracks(tracks)).toHaveLength(0);

    // The blip vanishes instead of repeating. It is never confirmed, and once
    // the occlusion tolerance has elapsed in real time the track is let go.
    tracks = updateTracks(tracks, [], 1100);
    tracks = updateTracks(tracks, [], 1200);
    expect(confirmedTracks(tracks)).toHaveLength(0);

    tracks = updateTracks(tracks, [], 1000 + DEFAULT_TRACKER_OPTIONS.dropAfterMs);
    expect(tracks).toHaveLength(0);
  });

  it('confirms a subject that persists', () => {
    let tracks = updateTracks([], [person(0.3)], 1000);
    tracks = updateTracks(tracks, [person(0.31)], 1100);
    expect(confirmedTracks(tracks)).toHaveLength(1);
    expect(tracks[0].hits).toBe(2);
  });

  it('keeps one identity while the subject moves gradually', () => {
    let tracks = updateTracks([], [person(0.30)], 1000);
    const id = tracks[0].id;
    for (const x of [0.32, 0.34, 0.36, 0.38]) tracks = updateTracks(tracks, [person(x)], 1100);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe(id);
  });

  it('survives a brief occlusion instead of splitting into two tracks', () => {
    let tracks = updateTracks([], [person(0.3)], 1000);
    tracks = updateTracks(tracks, [person(0.3)], 1100);
    const id = tracks[0].id;

    tracks = updateTracks(tracks, [], 1200);      // occluded
    tracks = updateTracks(tracks, [], 1300);
    expect(tracks).toHaveLength(1);

    tracks = updateTracks(tracks, [person(0.31)], 1400);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe(id);
    expect(tracks[0].misses).toBe(0);
  });

  it('drops a track once it has been missing long enough', () => {
    let tracks = updateTracks([], [person(0.3)], 1000);
    tracks = updateTracks(tracks, [], 1000 + DEFAULT_TRACKER_OPTIONS.dropAfterMs - 1);
    expect(tracks).toHaveLength(1);
    tracks = updateTracks(tracks, [], 1000 + DEFAULT_TRACKER_OPTIONS.dropAfterMs);
    expect(tracks).toHaveLength(0);
  });

  it('tolerates occlusion for the same wall-clock time at any analysis rate', () => {
    // The tolerance used to be counted in frames, so "Basse" (1 fps) forgave a
    // 3 s gap while "Haute" (5 fps) gave up after 0.6 s — the sensitivity
    // setting silently rescaled it.
    const survivesAt = (interval: number) => {
      let tracks = updateTracks([], [person(0.3)], 0);
      tracks = updateTracks(tracks, [person(0.3)], interval);
      let t = interval;
      // Look again after a gap of just under the tolerance, at this rate.
      while (t < DEFAULT_TRACKER_OPTIONS.dropAfterMs - interval) {
        t += interval;
        tracks = updateTracks(tracks, [], t);
      }
      return tracks.length;
    };
    expect(survivesAt(1000)).toBe(1);   // Basse
    expect(survivesAt(333)).toBe(1);    // Moyenne
    expect(survivesAt(200)).toBe(1);    // Haute
  });

  it('keeps a confirmed subject on screen through a missed frame', () => {
    // The overlay reads confirmedTracks; requiring misses === 0 made the box
    // blink out on any single miss and started the recording's post-roll
    // against a subject the tracker had not given up on.
    let tracks = updateTracks([], [person(0.3)], 1000);
    tracks = updateTracks(tracks, [person(0.3)], 1100);
    expect(confirmedTracks(tracks)).toHaveLength(1);

    tracks = updateTracks(tracks, [], 1200);
    expect(tracks[0].misses).toBe(1);
    expect(confirmedTracks(tracks)).toHaveLength(1);
    expect(primaryTrack(tracks)).not.toBeNull();

    tracks = updateTracks(tracks, [person(0.31)], 1300);
    expect(confirmedTracks(tracks)).toHaveLength(1);
  });

  it('tracks several subjects at once', () => {
    let tracks = updateTracks([], [person(0.05), person(0.6)], 1000);
    tracks = updateTracks(tracks, [person(0.06), person(0.61)], 1100);
    expect(confirmedTracks(tracks)).toHaveLength(2);
    expect(new Set(tracks.map(t => t.id)).size).toBe(2);
  });

  it('never hands a track to a detection of another kind', () => {
    let tracks = updateTracks([], [person(0.3)], 1000);
    const id = tracks[0].id;
    tracks = updateTracks(tracks, [animal(0.3)], 1100);
    // The person goes to a miss, the animal starts its own track.
    expect(tracks).toHaveLength(2);
    const dog = tracks.find(t => t.kind === 'Animal')!;
    expect(dog.id).not.toBe(id);
  });

  it('remembers the best confidence seen over the track\'s life', () => {
    let tracks = updateTracks([], [person(0.3, 0.3, 0.62)], 1000);
    tracks = updateTracks(tracks, [person(0.3, 0.3, 0.91)], 1100);
    tracks = updateTracks(tracks, [person(0.3, 0.3, 0.70)], 1200);
    expect(tracks[0].confidence).toBeCloseTo(0.70);
    expect(tracks[0].maxConfidence).toBeCloseTo(0.91);
  });
});

describe('primaryTrack', () => {
  it('is null when nothing is confirmed', () => {
    const tracks = updateTracks([], [person(0.3)], 1000);
    expect(primaryTrack(tracks)).toBeNull();
  });

  it('picks the most confident confirmed track', () => {
    let tracks = updateTracks([], [person(0.05, 0.3, 0.6), person(0.6, 0.3, 0.95)], 1000);
    tracks = updateTracks(tracks, [person(0.05, 0.3, 0.6), person(0.6, 0.3, 0.95)], 1100);
    expect(primaryTrack(tracks)!.confidence).toBeCloseTo(0.95);
  });

  it('holds on to a confirmed track through a miss, and lets go once dropped', () => {
    // This used to assert the opposite. Going null on the first miss is what
    // made the overlay blink and started the post-roll early; the track is only
    // gone once updateTracks has actually dropped it.
    let tracks: Track[] = updateTracks([], [person(0.3)], 1000);
    tracks = updateTracks(tracks, [person(0.3)], 1100);
    tracks = updateTracks(tracks, [], 1200);
    expect(primaryTrack(tracks)).not.toBeNull();

    tracks = updateTracks(tracks, [], 1100 + DEFAULT_TRACKER_OPTIONS.dropAfterMs);
    expect(tracks).toHaveLength(0);
    expect(primaryTrack(tracks)).toBeNull();
  });
});

import {
  bytesToReclaim,
  clipFileName,
  clipOutcome,
  eventsToReclaim,
  expiredEvents,
  formatBytes,
  LOW_SPACE_BYTES,
  maxDurationMs,
  nextEventId,
  periodDays,
  periodRange,
  postRollMs,
  qualityBitRate,
  qualityResolution,
  retentionDays,
  sameDay,
  todayCount,
  totalBytes,
} from '../src/recording/library';
import { DetectionEvent } from '../src/state/types';

const MB = 1024 * 1024;

function ev(id: number, daysBack: number, bytes = 10 * MB): DetectionEvent {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(12, 0, 0, 0);
  return {
    id, kind: 'Personne', timestamp: d.getTime(), dur: 12, conf: 90,
    path: `/clips/${id}.mp4`, bytes,
  };
}

describe('formatBytes', () => {
  it('uses French decimal separators', () => {
    expect(formatBytes(1.5 * MB)).toBe('1,5 Mo');
    expect(formatBytes(2.5 * 1024 * MB)).toBe('2,5 Go');
  });

  it('drops decimals once megabytes get large enough not to need them', () => {
    expect(formatBytes(14.4 * MB)).toBe('14 Mo');
  });

  it('never renders a negative or nonsense size', () => {
    expect(formatBytes(0)).toBe('0 Mo');
    expect(formatBytes(-5)).toBe('0 Mo');
    expect(formatBytes(NaN)).toBe('0 Mo');
  });
});

describe('setting translations', () => {
  it('maps every retention option, with "Toujours" meaning no expiry', () => {
    expect(retentionDays('1 jour')).toBe(1);
    expect(retentionDays('7 jours')).toBe(7);
    expect(retentionDays('30 jours')).toBe(30);
    expect(retentionDays('90 jours')).toBe(90);
    expect(retentionDays('Toujours')).toBeNull();
  });

  it('maps durations to milliseconds', () => {
    expect(maxDurationMs('1 min')).toBe(60_000);
    expect(maxDurationMs('5 min')).toBe(300_000);
    expect(postRollMs('5 s')).toBe(5_000);
    expect(postRollMs('30 s')).toBe(30_000);
  });

  it('gives each quality a distinct resolution and bitrate', () => {
    expect(qualityResolution('720p')).toEqual({ width: 1280, height: 720 });
    expect(qualityResolution('4K')).toEqual({ width: 3840, height: 2160 });
    const rates = (['720p', '1080p', '4K'] as const).map(qualityBitRate);
    expect(new Set(rates).size).toBe(3);
    expect(rates[0]).toBeLessThan(rates[2]);
  });

  it('states the bitrate in the megabits VisionCamera expects', () => {
    // Android does `videoBitRate * 1_000_000` and hands an Int to the encoder.
    // Written in bits per second — as these were — every value overflows Int
    // and the encoder is configured with something no device can honour.
    for (const quality of ['720p', '1080p', '4K'] as const) {
      const bitsPerSecond = qualityBitRate(quality) * 1_000_000;
      expect(bitsPerSecond).toBeLessThan(2 ** 31 - 1);
      expect(bitsPerSecond).toBeGreaterThan(1_000_000);
    }
  });
});

describe('expiredEvents', () => {
  const now = Date.now();

  it('keeps everything when retention is "Toujours"', () => {
    expect(expiredEvents([ev(1, 400)], 'Toujours', now)).toEqual([]);
  });

  it('drops only what falls outside the window', () => {
    const events = [ev(1, 0), ev(2, 3), ev(3, 10), ev(4, 40)];
    const expired = expiredEvents(events, '7 jours', now);
    expect(expired.map(e => e.id)).toEqual([3, 4]);
  });

  it('measures from the start of the day, so "1 jour" keeps today', () => {
    const expired = expiredEvents([ev(1, 0), ev(2, 1)], '1 jour', now);
    expect(expired.map(e => e.id)).toEqual([2]);
  });
});

describe('eventsToReclaim', () => {
  it('returns nothing when no space is needed', () => {
    expect(eventsToReclaim([ev(1, 5)], 0)).toEqual([]);
    expect(eventsToReclaim([ev(1, 5)], -1)).toEqual([]);
  });

  it('takes the oldest clips first and stops once the target is met', () => {
    const events = [ev(1, 0, 10 * MB), ev(2, 5, 10 * MB), ev(3, 9, 10 * MB)];
    const picked = eventsToReclaim(events, 15 * MB);
    expect(picked.map(e => e.id)).toEqual([3, 2]);
  });

  it('skips events with no file, which would free nothing', () => {
    const withFile = ev(1, 1, 10 * MB);
    const noFile: DetectionEvent = { ...ev(2, 9), path: null, bytes: 0 };
    expect(eventsToReclaim([withFile, noFile], 5 * MB).map(e => e.id)).toEqual([1]);
  });

  it('gives back everything it has when that still is not enough', () => {
    const events = [ev(1, 1, MB), ev(2, 2, MB)];
    expect(eventsToReclaim(events, 500 * MB)).toHaveLength(2);
  });
});

describe('bytesToReclaim', () => {
  it('asks for nothing while there is room', () => {
    expect(bytesToReclaim(LOW_SPACE_BYTES + MB)).toBe(0);
  });

  it('asks for the shortfall below the low-space mark', () => {
    expect(bytesToReclaim(LOW_SPACE_BYTES - 20 * MB)).toBe(20 * MB);
  });
});

describe('totalBytes', () => {
  it('sums real sizes and ignores fileless events', () => {
    const noFile: DetectionEvent = { ...ev(9, 1), path: null, bytes: 0 };
    expect(totalBytes([ev(1, 1, 3 * MB), ev(2, 2, 4 * MB), noFile])).toBe(7 * MB);
  });
});

describe('todayCount', () => {
  const noon = new Date(2026, 0, 15, 12, 0, 0).getTime();

  it('starts from zero with nothing stored', () => {
    expect(todayCount(null, noon)).toBe(0);
  });

  it('keeps the count within the same day', () => {
    const morning = new Date(2026, 0, 15, 8, 0, 0).getTime();
    expect(todayCount({ count: 4, day: morning }, noon)).toBe(4);
  });

  it('resets once the day has changed — the bug that made it a lifetime total', () => {
    const yesterday = new Date(2026, 0, 14, 23, 59, 0).getTime();
    expect(todayCount({ count: 41, day: yesterday }, noon)).toBe(0);
  });

  it('resets across a year boundary', () => {
    const lastYear = new Date(2025, 11, 31, 23, 0, 0).getTime();
    const newYear = new Date(2026, 0, 1, 1, 0, 0).getTime();
    expect(todayCount({ count: 7, day: lastYear }, newYear)).toBe(0);
  });
});

describe('sameDay', () => {
  it('separates days, not 24-hour spans', () => {
    const late = new Date(2026, 4, 3, 23, 55).getTime();
    const early = new Date(2026, 4, 4, 0, 5).getTime();
    expect(sameDay(late, early)).toBe(false);
    expect(sameDay(late, new Date(2026, 4, 3, 0, 1).getTime())).toBe(true);
  });
});

describe('clipFileName', () => {
  it('names a clip after what triggered it and when', () => {
    const at = new Date(2026, 8, 2, 14, 32, 7).getTime();
    expect(clipFileName('Personne', at)).toBe('Personne_2026-09-02_14-32-07.mp4');
  });

  it('distinguishes an animal', () => {
    const at = new Date(2026, 0, 5, 9, 4, 3).getTime();
    expect(clipFileName('Animal', at)).toBe('Animal_2026-01-05_09-04-03.mp4');
  });

  it('pads every field, so names sort chronologically as plain text', () => {
    const early = clipFileName('Personne', new Date(2026, 0, 5, 9, 4, 3).getTime());
    const later = clipFileName('Personne', new Date(2026, 0, 5, 10, 0, 0).getTime());
    const nextDay = clipFileName('Personne', new Date(2026, 0, 6, 0, 0, 0).getTime());
    expect([nextDay, later, early].sort()).toEqual([early, later, nextDay]);
  });

  it('uses only characters a filesystem is happy with', () => {
    const name = clipFileName('Personne', Date.now());
    expect(name).toMatch(/^[A-Za-z]+_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.mp4$/);
  });
});

describe('clipOutcome', () => {
  it('attaches a real recording to the detection that claimed it', () => {
    expect(clipOutcome(true, 12 * 1024 * 1024)).toBe('attach');
  });

  it('discards a recording nothing claims', () => {
    // The rule the whole thing exists for: never keep footage of an empty room
    // that no event points at.
    expect(clipOutcome(false, 12 * 1024 * 1024)).toBe('discard');
  });

  it('discards it whatever its size, if unclaimed', () => {
    expect(clipOutcome(false, 0)).toBe('discard');
    expect(clipOutcome(false, 1)).toBe('discard');
  });

  it('keeps the sighting but drops an empty file', () => {
    expect(clipOutcome(true, 0)).toBe('event-only');
  });

  it('has no fourth outcome', () => {
    const seen = new Set([
      clipOutcome(true, 1), clipOutcome(true, 0),
      clipOutcome(false, 1), clipOutcome(false, 0),
    ]);
    expect([...seen].sort()).toEqual(['attach', 'discard', 'event-only']);
  });
});

describe('nextEventId', () => {
  it('uses the timestamp when nothing collides', () => {
    expect(nextEventId(0, 1_000)).toBe(1_000);
    expect(nextEventId(900, 1_000)).toBe(1_000);
  });

  it('steps past an id already taken in the same millisecond', () => {
    expect(nextEventId(1_000, 1_000)).toBe(1_001);
    expect(nextEventId(1_001, 1_000)).toBe(1_002);
  });
});

describe('periodRange', () => {
  const now = new Date(2026, 8, 2, 15).getTime();
  const midnight = (m: number, d: number) => new Date(2026, m - 1, d).getTime();

  it('covers exactly the days each period names', () => {
    expect(periodRange("Aujourd'hui", now)).toEqual({ from: midnight(9, 2), to: midnight(9, 3) });
    expect(periodRange('7 jours', now).from).toBe(midnight(8, 27));
    expect(periodRange('30 jours', now).from).toBe(midnight(8, 4));
  });

  it('is unbounded below for Tout, and never includes the future', () => {
    expect(periodRange('Tout', now)).toEqual({ from: -Infinity, to: midnight(9, 3) });
  });

  it('maps every period to a day count', () => {
    expect(periodDays("Aujourd'hui")).toBe(0);
    expect(periodDays('Tout')).toBeNull();
  });
});

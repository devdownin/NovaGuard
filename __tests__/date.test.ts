/**
 * @format
 */

import { daysAgo, formatDuration, formatWhen, periodRange } from '../src/utils/date';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('periodRange', () => {
  const now = at(2026, 9, 2, 15);

  it("covers only today for Aujourd'hui", () => {
    const { from, to } = periodRange("Aujourd'hui", now);
    expect(from).toBe(at(2026, 9, 2, 0));
    expect(to).toBe(at(2026, 9, 3, 0));
  });

  it('covers the current day plus the six before it for 7 jours', () => {
    const { from } = periodRange('7 jours', now);
    expect(from).toBe(at(2026, 8, 27, 0));
  });

  it('covers the current day plus the twenty-nine before it for 30 jours', () => {
    const { from } = periodRange('30 jours', now);
    expect(from).toBe(at(2026, 8, 4, 0));
  });

  it('is unbounded below for Tout', () => {
    expect(periodRange('Tout', now).from).toBe(-Infinity);
  });

  // Subtracting 86_400_000 ms per day lands an hour off across a DST change,
  // which drags the previous evening's clips into (or out of) the window.
  it('walks calendar days across a daylight-saving change', () => {
    // Last Sunday of October 2026 — Europe falls back on the 25th.
    const { from } = periodRange('7 jours', at(2026, 10, 28, 15));
    const boundary = new Date(from);
    expect(boundary.getHours()).toBe(0);
    expect(boundary.getDate()).toBe(22);
  });

  it('excludes a timestamp stamped in the future', () => {
    const { to } = periodRange("Aujourd'hui", now);
    expect(at(2026, 9, 3, 1) < to).toBe(false);
  });

  it('agrees with daysAgo on which bucket a timestamp falls in', () => {
    for (const back of [0, 1, 5, 6, 7, 29, 30]) {
      const ts = at(2026, 9, 2, 9) - back * 86_400_000;
      const inWeek = ts >= periodRange('7 jours', now).from;
      expect(inWeek).toBe(daysAgo(ts) <= 6);
    }
  });
});

describe('formatWhen', () => {
  it('names today and yesterday', () => {
    expect(formatWhen(Date.now())).toMatch(/^Aujourd'hui, /);
    expect(formatWhen(Date.now() - 86_400_000)).toMatch(/^Hier, /);
  });
});

describe('formatDuration', () => {
  it('carries seconds over into minutes', () => {
    expect(formatDuration(18)).toBe('0:18');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(-3)).toBe('0:00');
  });
});

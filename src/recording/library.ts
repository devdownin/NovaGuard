import { DetectionEvent, MaxDuration, PostRoll, Quality, Retention } from '../state/types';

/**
 * Pure logic behind recording and storage management: how long a clip may run,
 * which clips have expired, and which ones to drop when the disk fills up.
 *
 * Everything here is deliberately free of filesystem and React so it can be
 * unit-tested — `videoStore.ts` holds the side effects.
 */

/** Below this much free space, auto-delete starts reclaiming room. */
export const LOW_SPACE_BYTES = 500 * 1024 * 1024;

/** Never start a recording without at least this much headroom. */
export const MIN_FREE_BYTES = 150 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Mo';
  const mo = bytes / (1024 * 1024);
  if (mo >= 1024) return (mo / 1024).toFixed(1).replace('.', ',') + ' Go';
  if (mo >= 10) return Math.round(mo).toString() + ' Mo';
  return mo.toFixed(1).replace('.', ',') + ' Mo';
}

/** `null` means "Toujours" — nothing ever expires on age alone. */
export function retentionDays(retention: Retention): number | null {
  switch (retention) {
    case '1 jour': return 1;
    case '7 jours': return 7;
    case '30 jours': return 30;
    case '90 jours': return 90;
    case 'Toujours': return null;
    default: return null;
  }
}

export function maxDurationMs(max: MaxDuration): number {
  switch (max) {
    case '1 min': return 60_000;
    case '2 min': return 120_000;
    case '5 min': return 300_000;
    default: return 120_000;
  }
}

export function postRollMs(post: PostRoll): number {
  switch (post) {
    case '5 s': return 5_000;
    case '10 s': return 10_000;
    case '30 s': return 30_000;
    default: return 10_000;
  }
}

export function qualityResolution(quality: Quality): { width: number; height: number } {
  switch (quality) {
    case '720p': return { width: 1280, height: 720 };
    case '1080p': return { width: 1920, height: 1080 };
    case '4K': return { width: 3840, height: 2160 };
    default: return { width: 1920, height: 1080 };
  }
}

/**
 * Target bitrates in Mbps, in the range VisionCamera accepts as a raw number.
 * Chosen well below broadcast rates: this is surveillance footage on a phone,
 * where hours of retained clips matter more than pristine gradients.
 */
export function qualityBitRate(quality: Quality): number {
  switch (quality) {
    case '720p': return 3_000_000;
    case '1080p': return 6_000_000;
    case '4K': return 20_000_000;
    default: return 6_000_000;
  }
}

export function totalBytes(events: DetectionEvent[]): number {
  return events.reduce((sum, e) => sum + (e.bytes > 0 ? e.bytes : 0), 0);
}

/**
 * Events past the retention window. Compares against the *start* of the
 * cutoff day so "1 jour" means "yesterday and earlier", not "24 h ago" —
 * otherwise a clip would disappear mid-morning on its own anniversary.
 */
export function expiredEvents(
  events: DetectionEvent[],
  retention: Retention,
  now: number,
): DetectionEvent[] {
  const days = retentionDays(retention);
  if (days == null) return [];
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  const cutoffMs = cutoff.getTime() - (days - 1) * 86_400_000;
  return events.filter(e => e.timestamp < cutoffMs);
}

/**
 * Oldest events to delete to reclaim `bytesNeeded`, oldest first.
 * Events carrying no file (bytes 0) are skipped — dropping them frees nothing
 * and would silently erase history the user can still read.
 */
export function eventsToReclaim(events: DetectionEvent[], bytesNeeded: number): DetectionEvent[] {
  if (bytesNeeded <= 0) return [];
  const oldestFirst = events.filter(e => e.bytes > 0).sort((a, b) => a.timestamp - b.timestamp);
  const picked: DetectionEvent[] = [];
  let freed = 0;
  for (const e of oldestFirst) {
    if (freed >= bytesNeeded) break;
    picked.push(e);
    freed += e.bytes;
  }
  return picked;
}

/** How many bytes auto-delete should reclaim to get back above the low-space mark. */
export function bytesToReclaim(freeSpace: number): number {
  return Math.max(0, LOW_SPACE_BYTES - freeSpace);
}

export function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * The counter shown as "détections aujourd'hui". It used to be persisted and
 * only ever incremented, so it silently became a lifetime total.
 */
export function todayCount(stored: { count: number; day: number } | null, now: number): number {
  if (!stored) return 0;
  return sameDay(stored.day, now) ? stored.count : 0;
}

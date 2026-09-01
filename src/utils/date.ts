const MONTHS_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

export function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole calendar days between `ts` and now (0 = today, 1 = yesterday, …). */
export function daysAgo(ts: number): number {
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  return Math.round((today - day) / 86400000);
}

/** "Aujourd'hui, 08:42" / "Hier, 22:31" / "28 août, 11:20" */
export function formatWhen(ts: number): string {
  const d = new Date(ts);
  const time = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const diff = daysAgo(ts);
  if (diff === 0) return "Aujourd'hui, " + time;
  if (diff === 1) return 'Hier, ' + time;
  return d.getDate() + ' ' + MONTHS_FR[d.getMonth()] + ', ' + time;
}

/** "01/09 14:32:07" */
export function formatClock(d: Date): string {
  return (
    pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
  );
}

/**
 * "0:18" / "2:05". Clips can now run to the configured maximum (up to 5 min),
 * so seconds have to carry over instead of being padded straight onto "0:".
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return Math.floor(total / 60) + ':' + pad(total % 60);
}

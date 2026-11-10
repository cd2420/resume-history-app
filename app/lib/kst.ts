// Korea has no daylight saving time, so a fixed +9h offset is exact.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function shifted(now: Date): Date {
  return new Date(now.getTime() + KST_OFFSET_MS);
}

/** Calendar date in Asia/Seoul as YYYY-MM-DD. */
export function kstDate(now: Date): string {
  return shifted(now).toISOString().slice(0, 10);
}

/** Hour of day (0-23) in Asia/Seoul. */
export function kstHour(now: Date): number {
  return shifted(now).getUTCHours();
}

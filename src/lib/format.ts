/** Human phrasing for "try again in…" messages, e.g. "in 5 minutes", "in about 14 hours". */
export function describeWait(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes <= 1) return "in a minute";
  if (minutes < 90) return `in ${minutes} minutes`;
  return `in about ${Math.round(minutes / 60)} hours`;
}

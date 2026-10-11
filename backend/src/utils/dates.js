/**
 * Date helpers.
 *
 * Day boundaries are computed in the *user's local timezone* using a tz offset
 * (minutes, as returned by Date.prototype.getTimezoneOffset — positive west of
 * UTC) sent by the frontend on every request (`X-Tz-Offset` header).
 *
 * Invariants:
 *  - `nextReviewDate` on a question is stored at UTC-midnight of the local
 *    calendar day it is due, so string/UTC comparisons are stable.
 *  - Every Revision document carries a `dateKey` (YYYY-MM-DD, local day) which
 *    powers the heatmap, habit tracker and streak calculations.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse an X-Tz-Offset header value safely (minutes). */
export function parseTzOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > 16 * 60) return 0;
  return Math.trunc(n);
}

/** YYYY-MM-DD for an instant, in the user's local timezone. */
export function dateKey(date = new Date(), tzOffsetMinutes = 0) {
  const d = new Date(date.getTime() - tzOffsetMinutes * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Shift a dateKey by n days. */
export function shiftKey(dateKeyStr, n) {
  const ms = Date.parse(`${dateKeyStr}T00:00:00.000Z`) + n * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/** UTC-midnight Date for a YYYY-MM-DD key (matches stored nextReviewDate). */
export function keyToUtcDate(dateKeyStr) {
  return new Date(`${dateKeyStr}T00:00:00.000Z`);
}

/** Inclusive start / exclusive end (UTC) of a local calendar day. */
export function dayBoundsUtc(dateKeyStr) {
  return {
    start: new Date(`${dateKeyStr}T00:00:00.000Z`),
    end: new Date(`${shiftKey(dateKeyStr, 1)}T00:00:00.000Z`),
  };
}

/** Whole days between two dateKeys (a - b). */
export function daysBetweenKeys(a, b) {
  return Math.round(
    (Date.parse(`${a}T00:00:00.000Z`) - Date.parse(`${b}T00:00:00.000Z`)) / DAY_MS
  );
}

/** "Today" for a tz offset. */
export function todayKey(tzOffsetMinutes = 0) {
  return dateKey(new Date(), tzOffsetMinutes);
}

/** Human friendly date: "Oct 5, 2026". */
export function formatDate(input) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "7 days ago" / "in 3 days" style relative label (server-side logs/emails). */
export function relativeLabel(input, now = new Date()) {
  if (!input) return 'never';
  const d = new Date(input);
  const diffMs = d.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const suffix = diffMs >= 0 ? '' : ' ago';
  const prefix = diffMs >= 0 ? 'in ' : '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${prefix}${mins} min${suffix}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${prefix}${hours} hour${suffix}`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${prefix}${days} day${suffix}`;
  const months = Math.round(days / 30);
  return `${prefix}${months} month${suffix}`;
}

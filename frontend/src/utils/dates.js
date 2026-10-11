/** Frontend date helpers — all display is local-timezone friendly. */

const DAY = 86400000;

export function localDayKey(date = new Date()) {
  const d = new Date(date);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function startOfLocalDay(key) {
  return new Date(`${key}T00:00:00`);
}

/** "Oct 5, 2026" */
export function formatDate(input) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Oct 5" (no year) */
export function formatShortDate(input) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "7 days ago" / "in 3 days" / "today" / "yesterday" */
export function relativeTime(input) {
  if (!input) return 'never';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return 'never';
  const now = Date.now();
  const diff = d.getTime() - now;
  const abs = Math.abs(diff);
  const days = Math.round(abs / DAY);

  if (abs < 60000) return diff >= 0 ? 'moments' : 'just now';
  if (days === 0) return diff >= 0 ? 'later today' : 'today';
  if (days === 1) return diff >= 0 ? 'tomorrow' : 'yesterday';
  if (days < 30) return diff >= 0 ? `in ${days} days` : `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return diff >= 0 ? `in ${months} months` : `${months} months ago`;
  const years = Math.round(months / 12);
  return diff >= 0 ? `in ${years} years` : `${years} years ago`;
}

/** Compact label used by revision cards: "Today" / "Overdue by 3d" / "Oct 15" */
export function dueLabel(daysUntilReview, nextReviewDate) {
  if (daysUntilReview === null || daysUntilReview === undefined) return 'Not scheduled';
  if (daysUntilReview < 0) return `Overdue by ${Math.abs(daysUntilReview)}d`;
  if (daysUntilReview === 0) return 'Today';
  if (daysUntilReview === 1) return 'Tomorrow';
  return formatDate(nextReviewDate);
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatMinutes(totalMinutes) {
  if (!totalMinutes) return '0m';
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatSeconds(seconds) {
  if (!seconds) return '<1m';
  return formatMinutes(Math.max(1, Math.round(seconds / 60)));
}

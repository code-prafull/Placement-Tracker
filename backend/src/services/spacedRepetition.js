/**
 * ============================================================================
 * DSAForge spaced-repetition engine  (the core of the whole application)
 * ============================================================================
 *
 * Rules implemented (spec §37):
 *   R5  "Forgot"  → schedule much sooner
 *   R6  repeated "Easy" → gradually increase the interval
 *   R7  overdue questions get higher priority
 *   R8  weak questions get higher priority than strong ones
 *
 * Base schedule for a freshly solved question (spec §4):
 *   Revision 1 → today, then ≈ +1 / +3 / +7 / +14 / +30 days depending on recall.
 *
 * Recall ratings modulate the schedule — intervals are NEVER blindly fixed:
 *   forgot → 1 day
 *   hard   → shrinks the current interval (floor 2 days)
 *   good   → grows the interval (≈ ×2, floor 7 days)
 *   easy   → grows faster (≈ ×2.4, floor 14 days)
 *
 * Memory strength (0-100) is derived ONLY from the stored revision history.
 */

export const RECALL_RESULTS = ['forgot', 'hard', 'good', 'easy'];

export const RATING_VALUE = { forgot: 0, hard: 35, good: 75, easy: 100 };

const TARGET_INTERVAL = { forgot: 1, hard: 2, good: 7, easy: 14 };
const GROWTH = { hard: 0.5, good: 2.0, easy: 2.4 };
const MIN_INTERVAL = { forgot: 1, hard: 2, good: 7, easy: 14 };
const MAX_INTERVAL = 365;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Days until the next review.
 *
 * @param {Object} p
 * @param {number} p.previousInterval  interval (days) that produced the current schedule
 * @param {number} p.revisionCount     completed revisions BEFORE this one
 * @param {string} p.result            forgot | hard | good | easy
 * @param {number} [p.actualGapDays]   real days elapsed since the previous review
 * @returns {number} interval in days (>= 1)
 */
export function computeNextInterval({ previousInterval = 0, revisionCount = 0, result, actualGapDays = 0 }) {
  if (!RECALL_RESULTS.includes(result)) return 1;

  // First ever review of a freshly solved question → follow the spec table.
  if (revisionCount === 0) return TARGET_INTERVAL[result];

  const prev = Math.max(1, previousInterval);

  if (result === 'forgot') return 1; // R5: come back tomorrow

  if (result === 'hard') {
    // Hard shrinks the interval but never below 2 days.
    return clamp(Math.round(prev * GROWTH.hard), MIN_INTERVAL.hard, MAX_INTERVAL);
  }

  // good / easy: grow from the previous interval. If the question actually
  // survived much longer than scheduled (revised late) and was still recalled,
  // grow from the *real* gap too — memory that survived 40 days deserves it.
  let base = prev;
  if (actualGapDays > prev) base = Math.max(prev, Math.min(actualGapDays, prev * 3));

  const next = Math.round(base * GROWTH[result]);
  return clamp(next, MIN_INTERVAL[result], MAX_INTERVAL);
}

/**
 * Memory strength 0-100 computed from the revision history.
 * Categories: <25 Forgotten · <45 Weak · <65 Learning · <85 Strong · ≥85 Mastered
 *
 * @param {Object} p
 * @param {string[]} p.results        recall results in chronological order (oldest first)
 * @param {number} p.revisionCount    total completed revisions
 * @param {number} [p.intervalDays]   currently scheduled interval
 * @param {number} [p.daysSinceLastReview] days since the previous review (0 right after reviewing)
 */
export function computeMemoryStrength({ results = [], revisionCount = 0, intervalDays = 0, daysSinceLastReview = 0 }) {
  if (!results.length) return 50; // never revised → neutral, untested

  // Recency-weighted average of recall results (recent results dominate).
  let weightSum = 0;
  let valueSum = 0;
  results.forEach((r, i) => {
    const w = Math.pow(0.82, results.length - 1 - i);
    weightSum += w;
    valueSum += w * (RATING_VALUE[r] ?? 0);
  });
  const score = weightSum > 0 ? valueSum / weightSum : 0;

  // Battle-tested bonus: only counts when the recall quality justifies it —
  // repeatedly bombing a question can never inflate its score (max +20).
  const retention = (Math.min(Math.max(revisionCount, 0), 10) / 10) * 20 * (score / 100);

  // Consecutive trailing good/easy ratings.
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] === 'good' || results[i] === 'easy') streak++;
    else break;
  }
  const streakBonus = Math.min(streak * 4, 20);

  // Decay when the question sits unrevised well past its interval.
  let decay = 0;
  if (intervalDays > 0 && daysSinceLastReview > intervalDays) {
    const ratio = Math.min(1, (daysSinceLastReview - intervalDays) / Math.max(intervalDays, 7));
    decay = ratio * 25;
  }

  // Recall quality dominates: a bombing question can never be rescued by
  // simply reviewing it many times.
  return clamp(Math.round(0.75 * score + retention + streakBonus - decay), 0, 100);
}

export function categoryFromStrength(strength) {
  if (strength < 25) return 'Forgotten';
  if (strength < 45) return 'Weak';
  if (strength < 65) return 'Learning';
  if (strength < 85) return 'Strong';
  return 'Mastered';
}

/** Denormalized weakness flags stored after every revision (used for queries). */
export function computeWeakFlags({ results = [], memoryStrength = 50, revisionCount = 0 }) {
  const flags = [];
  if (revisionCount > 0 && memoryStrength < 45) flags.push('low_memory');
  const last = results[results.length - 1];
  if (last === 'forgot') flags.push('recent_forgot');
  const last3 = results.slice(-3);
  const bad = last3.filter((r) => r === 'hard' || r === 'forgot').length;
  if (revisionCount >= 2 && bad >= 2) flags.push('repeated_hard');
  return flags;
}

/** Queue status derived at write time (reads also re-derive from the date). */
export function deriveRevisionStatus({ nextReviewDate, todayKeyStr, memoryStrength = 0, interval = 0 }) {
  if (!nextReviewDate) return 'new';
  const dueKey = new Date(nextReviewDate).toISOString().slice(0, 10);
  if (dueKey < todayKeyStr) return 'overdue';
  if (dueKey === todayKeyStr) return 'due';
  if (memoryStrength >= 85 && interval >= 30) return 'mastered';
  return 'scheduled';
}

/**
 * Queue priority (higher = revise sooner). Overdue beats weak beats strong (R7/R8).
 */
export function priorityScore({ nextReviewDate, memoryStrength = 50, weakFlags = [], todayKeyStr }) {
  let score = 100 - memoryStrength;
  if (nextReviewDate && todayKeyStr) {
    const dueKey = new Date(nextReviewDate).toISOString().slice(0, 10);
    const days = Math.round(
      (Date.parse(`${todayKeyStr}T00:00:00Z`) - Date.parse(`${dueKey}T00:00:00Z`)) / 86400000
    );
    if (days > 0) score += days * 40; // strongly favour overdue (R7)
    else if (days === 0) score += 15; // due today
  }
  score += weakFlags.length * 25; // weak > strong (R8)
  return score;
}

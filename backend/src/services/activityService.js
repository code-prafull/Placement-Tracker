import DailyActivity from '../models/DailyActivity.js';
import Revision from '../models/Revision.js';
import Question from '../models/Question.js';
import { dateKey, shiftKey, todayKey } from '../utils/dates.js';

/* -------------------------------------------------------------------------- */
/* Activity write helpers                                                      */
/* -------------------------------------------------------------------------- */

/** Increment today's revision counter (solved & revised stay SEPARATE). */
export async function bumpRevisionActivity(userId, dateKeyValue, result) {
  await DailyActivity.findOneAndUpdate(
    { userId, date: dateKeyValue },
    {
      $inc: { revisedCount: 1, [`results.${result}`]: 1 },
      $setOnInsert: { userId, date: dateKeyValue },
    },
    { upsert: true, new: true }
  );
}

/** Mark one more question solved on its solve day (only on first transition). */
export async function bumpSolvedActivity(userId, dateKeyValue) {
  if (!dateKeyValue) return;
  await DailyActivity.findOneAndUpdate(
    { userId, date: dateKeyValue },
    { $inc: { solvedCount: 1 }, $setOnInsert: { userId, date: dateKeyValue } },
    { upsert: true, new: true }
  );
}

/** Reverse one solved marker (question un-solved or deleted). */
export async function unbumpSolvedActivity(userId, dateKeyValue) {
  if (!dateKeyValue) return;
  await DailyActivity.updateOne(
    { userId, date: dateKeyValue },
    { $inc: { solvedCount: -1 } }
  );
}

/**
 * Reverse revision activity for deleted questions so aggregate days stay
 * truthful (the Revision rows themselves are deleted by the caller).
 * @param {Object} resultsMap e.g. { forgot: 1, good: 2 }
 */
export async function unbumpRevisionActivity(userId, dateKeyValue, resultsMap = {}) {
  if (!dateKeyValue) return;
  const inc = { revisedCount: -1 };
  for (const [k, v] of Object.entries(resultsMap || {})) {
    if (v) inc[`results.${k}`] = -v;
  }
  await DailyActivity.updateOne({ userId, date: dateKeyValue }, { $inc: inc });
}

/* -------------------------------------------------------------------------- */
/* Heatmap / habit reads                                                       */
/* -------------------------------------------------------------------------- */

/**
 * GitHub-style revision heatmap.
 * @returns {Array<{date: string, revisions: number, solved: number}>}
 */
export async function getHeatmap(userId, weeks = 26, tzOffset = 0) {
  const endKey = todayKey(tzOffset);
  const startKey = shiftKey(endKey, -(weeks * 7 - 1));

  const rows = await DailyActivity.find({
    userId,
    date: { $gte: startKey, $lte: endKey },
  }).lean();

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out = [];
  for (let k = startKey; k <= endKey; k = shiftKey(k, 1)) {
    const row = byDate.get(k);
    out.push({
      date: k,
      revisions: Math.max(0, row?.revisedCount || 0),
      solved: Math.max(0, row?.solvedCount || 0),
    });
  }
  return out;
}

/** Everything that happened on one day (heatmap click → drill-down). */
export async function getDayDetail(userId, dateKeyValue) {
  const revisions = await Revision.find({
    userId,
    status: 'completed',
    dateKey: dateKeyValue,
  })
    .populate({ path: 'questionId', select: 'title difficulty topics' })
    .sort({ reviewedAt: 1 })
    .lean();

  const activity = await DailyActivity.findOne({ userId, date: dateKeyValue }).lean();

  return {
    date: dateKeyValue,
    revisedCount: Math.max(0, activity?.revisedCount || revisions.length),
    solvedCount: Math.max(0, activity?.solvedCount || 0),
    revisions: revisions.map((r) => ({
      id: r._id,
      questionId: r.questionId?._id,
      title: r.questionId?.title || '(deleted question)',
      topics: r.questionId?.topics || [],
      difficulty: r.questionId?.difficulty,
      result: r.result,
      reviewedAt: r.reviewedAt,
      secondsSpent: r.secondsSpent,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Streak — always derived from actual Revision documents (Rule 4 / §21)        */
/* -------------------------------------------------------------------------- */

/**
 * Current streak = consecutive days (ending today or yesterday) with ≥1
 * completed revision. Computed by walking back over real revision records.
 */
export async function getStreak(userId, tzOffset = 0) {
  const rows = await Revision.find({ userId, status: 'completed' })
    .select('dateKey')
    .sort({ dateKey: -1 })
    .lean();

  const days = [...new Set(rows.map((r) => r.dateKey).filter(Boolean))];
  if (days.length === 0) {
    return { current: 0, longest: 0, totalDays: 0, activeToday: false };
  }

  const daySet = new Set(days);
  const today = todayKey(tzOffset);

  // Current streak: walk back from today (allow today to be missing → streak
  // survives until the day ends).
  let current = 0;
  let cursor = daySet.has(today) ? today : shiftKey(today, -1);
  if (daySet.has(cursor)) {
    while (daySet.has(cursor)) {
      current++;
      cursor = shiftKey(cursor, -1);
    }
  }

  // Longest streak over all recorded days.
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of [...days].sort()) {
    if (prev && shiftKey(prev, 1) === d) run++;
    else run = 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  return {
    current,
    longest,
    totalDays: days.length,
    activeToday: daySet.has(today),
  };
}

/** Solved vs revised totals for a given local day (habit page). */
export async function getDayCounts(userId, dateKeyValue) {
  const activity = await DailyActivity.findOne({ userId, date: dateKeyValue }).lean();
  const revisedFromRevisions = await Revision.countDocuments({
    userId,
    status: 'completed',
    dateKey: dateKeyValue,
  });
  return {
    date: dateKeyValue,
    solved: Math.max(0, activity?.solvedCount || 0),
    revised: Math.max(revisedFromRevisions, Math.max(0, activity?.revisedCount || 0)),
    results: activity?.results || { forgot: 0, hard: 0, good: 0, easy: 0 },
  };
}

export { dateKey };

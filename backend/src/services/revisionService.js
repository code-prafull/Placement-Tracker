import mongoose from 'mongoose';
import Revision, { RECALL_RESULTS } from '../models/Revision.js';
import Question from '../models/Question.js';
import ApiError from '../utils/ApiError.js';
import {
  computeNextInterval,
  computeMemoryStrength,
  computeWeakFlags,
  deriveRevisionStatus,
  priorityScore,
} from './spacedRepetition.js';
import { dateKey, dayBoundsUtc, daysBetweenKeys, keyToUtcDate, todayKey } from '../utils/dates.js';
import { bumpRevisionActivity } from './activityService.js';

const QUESTION_POPULATE = {
  path: 'questionId',
  select:
    'title difficulty topics description examples constraints hints approach code notes language timeComplexity spaceComplexity externalLink platform mistakes revision status solvedAt',
};

/* -------------------------------------------------------------------------- */
/* Queue builders                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Base filter for questions that are part of the revision system (solved).
 * @returns {{ filter: Object, todayKeyStr: string }}
 */
function revisionFilter(userId, tzOffset) {
  const todayKeyStr = todayKey(tzOffset);
  const today = dayBoundsUtc(todayKeyStr);
  return {
    todayKeyStr,
    today,
    filter: { userId, status: 'solved', 'revision.nextReviewDate': { $ne: null } },
  };
}

function serializeQuestion(q, todayKeyStr) {
  if (!q) return null;
  const obj = q.toJSON ? q.toJSON() : q;
  const rev = obj.revision || {};
  const dueKey = rev.nextReviewDate ? new Date(rev.nextReviewDate).toISOString().slice(0, 10) : null;
  const days = dueKey ? daysBetweenKeys(dueKey, todayKeyStr) : null; // >0 upcoming, 0 today, <0 overdue
  let derived = rev.status || 'new';
  if (dueKey) {
    if (days < 0) derived = 'overdue';
    else if (days === 0) derived = 'due';
    else if ((rev.memoryStrength ?? 0) >= 85 && (rev.interval ?? 0) >= 30) derived = 'mastered';
    else derived = 'scheduled';
  }
  return {
    ...obj,
    revision: {
      ...rev,
      nextReviewDate: rev.nextReviewDate || null,
      derivedStatus: derived,
      daysUntilReview: days,
      category:
        (rev.memoryStrength ?? 50) < 25
          ? 'Forgotten'
          : (rev.memoryStrength ?? 50) < 45
            ? 'Weak'
            : (rev.memoryStrength ?? 50) < 65
              ? 'Learning'
              : (rev.memoryStrength ?? 50) < 85
                ? 'Strong'
                : 'Mastered',
      priority: priorityScore({
        nextReviewDate: rev.nextReviewDate,
        memoryStrength: rev.memoryStrength ?? 50,
        weakFlags: rev.weakFlags || [],
        todayKeyStr,
      }),
    },
  };
}

function sortByPriority(list) {
  return list.sort((a, b) => (b.revision?.priority ?? 0) - (a.revision?.priority ?? 0));
}

/** Fetch a full queue (due / overdue / upcoming / recent / difficult / forgotten). */
export async function getQueue(userId, queue, tzOffset, { limit = 200 } = {}) {
  const { filter, todayKeyStr, today } = revisionFilter(userId, tzOffset);
  let q = { ...filter };

  switch (queue) {
    case 'due':
      q['revision.nextReviewDate'] = { $gte: today.start, $lt: today.end };
      break;
    case 'overdue':
      q['revision.nextReviewDate'] = { $lt: today.start };
      break;
    case 'upcoming':
      q['revision.nextReviewDate'] = { $gte: today.end };
      break;
    case 'recent': {
      const since = new Date(Date.now() - 7 * 86400000);
      q['revision.lastReviewedAt'] = { $gte: since };
      break;
    }
    case 'difficult':
      q.$or = [
        { 'revision.memoryStrength': { $lt: 45, $gte: 0 } },
        { 'revision.lastResult': 'forgot' },
        { 'revision.weakFlags': { $in: ['recent_forgot', 'repeated_hard'] } },
        { 'revision.nextReviewDate': { $lt: keyToUtcDate(new Date(Date.parse(`${todayKeyStr}T00:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10)) } },
      ];
      // never-revised questions are not "difficult"
      q['revision.revisionCount'] = { $gte: 1 };
      break;
    case 'forgotten':
      q['revision.revisionCount'] = { $gte: 1 };
      q.$or = [
        { 'revision.memoryStrength': { $lt: 25 } },
        { 'revision.lastResult': 'forgot' },
      ];
      break;
    case 'weak':
      q['revision.revisionCount'] = { $gte: 1 };
      q.$or = [
        { 'revision.memoryStrength': { $lt: 45 } },
        { 'revision.lastResult': 'forgot' },
        { 'revision.weakFlags': { $in: ['low_memory', 'recent_forgot', 'repeated_hard'] } },
        {
          'revision.nextReviewDate': {
            $lt: keyToUtcDate(new Date(Date.parse(`${todayKeyStr}T00:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10)),
          },
        },
      ];
      break;
    default:
      break;
  }

  const docs = await Question.find(q)
    .sort({ 'revision.nextReviewDate': 1 })
    .limit(limit);
  const items = docs.map((d) => serializeQuestion(d, todayKeyStr));
  return sortByPriority(items);
}

/** Counts for all six queues (sidebar badge + dashboard + tabs). */
export async function getQueueCounts(userId, tzOffset) {
  const { filter, todayKeyStr, today } = revisionFilter(userId, tzOffset);
  const staleBefore = keyToUtcDate(
    new Date(Date.parse(`${todayKeyStr}T00:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10)
  );

  const base = Question.find(filter).select('revision status').lean();
  const [due, overdue, upcoming, recent, difficult, forgotten] = await Promise.all([
    Question.countDocuments({ ...filter, 'revision.nextReviewDate': { $gte: today.start, $lt: today.end } }),
    Question.countDocuments({ ...filter, 'revision.nextReviewDate': { $lt: today.start } }),
    Question.countDocuments({ ...filter, 'revision.nextReviewDate': { $gte: today.end } }),
    Question.countDocuments({ ...filter, 'revision.lastReviewedAt': { $gte: new Date(Date.now() - 7 * 86400000) } }),
    Question.countDocuments({
      ...filter,
      'revision.revisionCount': { $gte: 1 },
      $or: [
        { 'revision.memoryStrength': { $lt: 45 } },
        { 'revision.lastResult': 'forgot' },
        { 'revision.weakFlags': { $in: ['recent_forgot', 'repeated_hard'] } },
        { 'revision.nextReviewDate': { $lt: staleBefore } },
      ],
    }),
    Question.countDocuments({
      ...filter,
      'revision.revisionCount': { $gte: 1 },
      $or: [{ 'revision.memoryStrength': { $lt: 25 } }, { 'revision.lastResult': 'forgot' }],
    }),
  ]);
  void base;
  return { due, overdue, upcoming, recent, difficult, forgotten, todayKey: todayKeyStr };
}

/* -------------------------------------------------------------------------- */
/* Session lifecycle                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Start revising a question. Creates (or returns) the single in-progress
 * revision row — the unique partial index makes duplicate starts impossible
 * (Rule 9: no duplicate records from double clicks).
 */
export async function startRevision(userId, questionId, tzOffset) {
  const question = await Question.findOne({ _id: questionId, userId });
  if (!question) throw new ApiError(404, 'Question not found');
  if (question.status !== 'solved') {
    throw new ApiError(400, 'Only solved questions can be revised — mark it as solved first');
  }

  const existing = await Revision.findOne({ userId, questionId, status: 'in_progress' });
  if (existing) return { revision: existing, question, resumed: true };

  const revision = await Revision.create({
    userId,
    questionId,
    status: 'in_progress',
    startedAt: new Date(),
    previousInterval: question.revision?.interval || 0,
    memoryStrengthBefore: question.revision?.memoryStrength ?? 50,
  });
  return { revision, question, resumed: false };
}

/**
 * Complete a revision: store the immutable history row, reschedule the
 * question and refresh every derived metric.
 *
 * Returns the completed revision (idempotent for repeated clicks).
 */
export async function completeRevision(userId, questionId, payload, tzOffset) {
  const { result, recalledApproach = '', recalledCode = '', mistake = {}, mode = 'quick', startedAt } = payload;

  if (!RECALL_RESULTS.includes(result)) {
    throw new ApiError(400, 'result must be one of: forgot, hard, good, easy');
  }

  const question = await Question.findOne({ _id: questionId, userId });
  if (!question) throw new ApiError(404, 'Question not found');

  const now = new Date();
  const todayKeyStr = dateKey(now, tzOffset);

  // --- duplicate-click guard (Rule 9) -------------------------------------
  let inProgress = await Revision.findOne({ userId, questionId, status: 'in_progress' });

  if (!inProgress) {
    // No live session → check whether this question was just completed.
    const recent = await Revision.findOne({
      userId,
      questionId,
      status: 'completed',
      reviewedAt: { $gte: new Date(now.getTime() - 60 * 1000) },
    }).sort({ reviewedAt: -1 });
    if (recent) return { revision: recent, question, duplicate: true };
  }

  const secondsSpent = startedAt
    ? Math.max(0, Math.round((now.getTime() - new Date(startedAt).getTime()) / 1000))
    : inProgress?.startedAt
      ? Math.max(0, Math.round((now.getTime() - inProgress.startedAt.getTime()) / 1000))
      : 0;

  const revState = question.revision?.interval || 0;
  const previousInterval = inProgress?.previousInterval ?? revState;
  const revisionCount = question.revision?.revisionCount || 0;

  const lastReviewedAt = question.revision?.lastReviewedAt || null;
  const actualGapDays = lastReviewedAt
    ? Math.max(0, Math.round((now.getTime() - lastReviewedAt.getTime()) / 86400000))
    : 0;

  // --- the scheduling decision --------------------------------------------
  const nextInterval = computeNextInterval({
    previousInterval,
    revisionCount,
    result,
    actualGapDays,
  });

  const history = await Revision.find({
    userId,
    questionId,
    status: 'completed',
  })
    .sort({ reviewedAt: 1 })
    .select('result reviewedAt')
    .lean();

  const results = history.map((h) => h.result).concat(result);
  const memoryStrengthAfter = computeMemoryStrength({
    results,
    revisionCount: revisionCount + 1,
    intervalDays: nextInterval,
    daysSinceLastReview: 0,
  });
  const weakFlags = computeWeakFlags({
    results,
    memoryStrength: memoryStrengthAfter,
    revisionCount: revisionCount + 1,
  });

  const nextDateKey = new Date(
    new Date(`${todayKeyStr}T00:00:00.000Z`).getTime() + nextInterval * 86400000
  )
    .toISOString()
    .slice(0, 10);
  const nextReviewDate = keyToUtcDate(nextDateKey);

  const hasMistake = mistake && Object.values(mistake).some((v) => String(v || '').trim());

  // --- atomically finish the in-progress row (or create the history row) ---
  let revision;
  if (inProgress) {
    revision = await Revision.findOneAndUpdate(
      { _id: inProgress._id, status: 'in_progress' },
      {
        $set: {
          status: 'completed',
          reviewedAt: now,
          dateKey: todayKeyStr,
          result,
          previousInterval,
          nextInterval,
          nextReviewDate,
          memoryStrengthBefore: inProgress.memoryStrengthBefore ?? question.revision?.memoryStrength ?? 50,
          memoryStrengthAfter,
          recalledApproach: String(recalledApproach || '').slice(0, 8000),
          recalledCode: String(recalledCode || '').slice(0, 30000),
          mistake: hasMistake
            ? {
                forgotWhat: String(mistake.forgotWhat || '').slice(0, 2000),
                gotStuck: String(mistake.gotStuck || '').slice(0, 2000),
                mistake: String(mistake.mistake || '').slice(0, 2000),
                insight: String(mistake.insight || '').slice(0, 2000),
              }
            : undefined,
          mode,
          secondsSpent,
        },
      },
      { new: true }
    );
  }

  if (!revision) {
    // Defensive: no live session and nothing recent → create history directly.
    revision = await Revision.create({
      userId,
      questionId,
      status: 'completed',
      startedAt: now,
      reviewedAt: now,
      dateKey: todayKeyStr,
      result,
      previousInterval,
      nextInterval,
      nextReviewDate,
      memoryStrengthBefore: question.revision?.memoryStrength ?? 50,
      memoryStrengthAfter,
      recalledApproach: String(recalledApproach || '').slice(0, 8000),
      recalledCode: String(recalledCode || '').slice(0, 30000),
      mistake: hasMistake ? mistake : undefined,
      mode,
      secondsSpent,
    });
  }

  // --- update the question's revision state --------------------------------
  const resultStreak =
    result === 'good' || result === 'easy'
      ? (question.revision?.resultStreak || 0) + 1
      : 0;

  question.revision = {
    ...(question.revision?.toObject?.() || question.revision || {}),
    nextReviewDate,
    lastReviewedAt: now,
    revisionCount: revisionCount + 1,
    memoryStrength: memoryStrengthAfter,
    interval: nextInterval,
    lastResult: result,
    resultStreak,
    weakFlags,
    totalRevisionSeconds: (question.revision?.totalRevisionSeconds || 0) + secondsSpent,
    status: deriveRevisionStatus({
      nextReviewDate,
      todayKeyStr,
      memoryStrength: memoryStrengthAfter,
      interval: nextInterval,
    }),
  };

  if (hasMistake) {
    question.mistakes = question.mistakes || [];
    question.mistakes.push({
      forgotWhat: mistake.forgotWhat || '',
      gotStuck: mistake.gotStuck || '',
      mistake: mistake.mistake || '',
      insight: mistake.insight || '',
      result,
      reviewedAt: now,
    });
  }

  // The code written from memory during the session becomes the question's
  // stored code — the user's latest recalled version wins.
  const typedCode = String(recalledCode || '').trim();
  if (typedCode) {
    question.code = typedCode;
  }

  await question.save();

  // --- habit tracker / heatmap (separate from solving!) ---------------------
  await bumpRevisionActivity(userId, todayKeyStr, result);

  return {
    revision,
    question,
    nextReviewDate,
    nextReviewDateKey: nextDateKey,
    memoryStrength: memoryStrengthAfter,
    interval: nextInterval,
    duplicate: false,
  };
}

/** Full history for one question (immutable rows, newest first). */
export async function getQuestionHistory(userId, questionId) {
  const rows = await Revision.find({
    userId,
    questionId,
    status: 'completed',
  })
    .sort({ reviewedAt: -1 })
    .lean();
  return rows;
}

export { serializeQuestion };

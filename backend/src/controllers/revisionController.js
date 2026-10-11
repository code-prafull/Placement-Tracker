import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import Question from '../models/Question.js';
import Revision from '../models/Revision.js';
import * as revisionService from '../services/revisionService.js';
import { priorityScore } from '../services/spacedRepetition.js';
import { dayBoundsUtc, todayKey } from '../utils/dates.js';

const QUEUES = ['due', 'overdue', 'upcoming', 'recent', 'difficult', 'forgotten', 'weak'];

/* -------------------------------------------------------------------------- */
/* Queues                                                                      */
/* -------------------------------------------------------------------------- */

/** GET /api/revisions/today */
export const todayQueue = asyncHandler(async (req, res) => {
  const tz = req.tzOffset;
  const [due, overdue] = await Promise.all([
    revisionService.getQueue(req.userId, 'due', tz),
    revisionService.getQueue(req.userId, 'overdue', tz),
  ]);
  const counts = await revisionService.getQueueCounts(req.userId, tz);
  const todayKeyStr = todayKey(tz);
  const revisedToday = await Revision.countDocuments({
    userId: req.userId,
    status: 'completed',
    dateKey: todayKeyStr,
  });

  res.json({
    success: true,
    date: todayKeyStr,
    due,
    overdue,
    counts,
    revisedToday,
    // Priority order: overdue first, then weak (Rules 7 & 8)
    items: [...overdue, ...due],
  });
});

/** GET /api/revisions/overdue */
export const overdueQueue = asyncHandler(async (req, res) => {
  res.json({ success: true, items: await revisionService.getQueue(req.userId, 'overdue', req.tzOffset) });
});

/** GET /api/revisions/upcoming */
export const upcomingQueue = asyncHandler(async (req, res) => {
  res.json({ success: true, items: await revisionService.getQueue(req.userId, 'upcoming', req.tzOffset) });
});

/** GET /api/revisions/weak → alias of the weak/difficult queue (§15) */
export const weakQueue = asyncHandler(async (req, res) => {
  const items = await revisionService.getQueue(req.userId, 'weak', req.tzOffset);
  res.json({ success: true, items });
});

/** GET /api/revisions/queues/:name — generic queue access + counts */
export const queue = asyncHandler(async (req, res) => {
  const name = req.params.name;
  if (!QUEUES.includes(name)) throw new ApiError(400, `Unknown queue: ${name}`);
  const [items, counts] = await Promise.all([
    revisionService.getQueue(req.userId, name === 'weak' ? 'weak' : name, req.tzOffset),
    revisionService.getQueueCounts(req.userId, req.tzOffset),
  ]);
  res.json({ success: true, items, counts });
});

/** GET /api/revisions/counts — lightweight sidebar badge */
export const counts = asyncHandler(async (req, res) => {
  res.json({ success: true, counts: await revisionService.getQueueCounts(req.userId, req.tzOffset) });
});

/* -------------------------------------------------------------------------- */
/* Session lifecycle                                                           */
/* -------------------------------------------------------------------------- */

function assertId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.questionId)) {
    return next(new ApiError(400, 'Invalid question id'));
  }
  next();
}

/** POST /api/revisions/:questionId/start */
export const start = [
  assertId,
  asyncHandler(async (req, res) => {
    const { revision, question, resumed } = await revisionService.startRevision(
      req.userId,
      req.params.questionId,
      req.tzOffset
    );
    res.json({
      success: true,
      revision,
      question,
      resumed,
      history: await revisionService.getQuestionHistory(req.userId, req.params.questionId),
    });
  }),
];

/** POST /api/revisions/:questionId/complete */
export const complete = [
  assertId,
  asyncHandler(async (req, res) => {
    const result = await revisionService.completeRevision(
      req.userId,
      req.params.questionId,
      req.body || {},
      req.tzOffset
    );
    const counts = await revisionService.getQueueCounts(req.userId, req.tzOffset);
    res.json({
      success: true,
      duplicate: result.duplicate,
      revision: result.revision,
      nextReviewDate: result.nextReviewDate,
      nextReviewDateKey: result.nextReviewDateKey,
      memoryStrength: result.memoryStrength,
      memoryCategory: result.question.memoryCategory,
      interval: result.interval,
      question: result.question,
      counts,
      message: result.duplicate
        ? 'This revision was already recorded'
        : `Revision recorded — next review ${result.nextReviewDateKey}`,
    });
  }),
];

/** GET /api/revisions/:questionId/history */
export const history = [
  assertId,
  asyncHandler(async (req, res) => {
    const rows = await revisionService.getQuestionHistory(req.userId, req.params.questionId);
    res.json({ success: true, history: rows });
  }),
];

/* -------------------------------------------------------------------------- */
/* Revision modes (§17): quick · deep · random                                 */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/revisions/session { mode, count?, queue?, topics? }
 * Returns the ordered list of questions to revise. No solutions are hidden
 * from the client (it's personal data) — the UI controls the reveal order.
 */
export const buildSession = asyncHandler(async (req, res) => {
  const mode = ['quick', 'deep', 'random'].includes(req.body?.mode) ? req.body.mode : 'quick';
  const count = Math.min(30, Math.max(1, Number(req.body?.count) || (mode === 'random' ? 5 : 20)));
  const tz = req.tzOffset;
  const todayKeyStr = todayKey(tz);

  let pool;
  if (mode === 'random') {
    // Random prioritises forgotten → weak → due/overdue → everything else.
    const all = await Question.find({ userId: req.userId, status: 'solved' })
      .sort({ 'revision.nextReviewDate': 1 })
      .limit(500)
      .lean();
    const weight = (q) => {
      const s = q.revision?.memoryStrength ?? 50;
      const count0 = q.revision?.revisionCount || 0;
      if (count0 === 0) return 1;
      if (s < 25) return 8;
      if (s < 45) return 5;
      const due = q.revision?.nextReviewDate &&
        new Date(q.revision.nextReviewDate) < dayBoundsUtc(todayKeyStr).end;
      if (due) return 4;
      return 2;
    };
    // Weighted sampling without replacement.
    const bag = [];
    for (const q of all) for (let i = 0; i < weight(q); i++) bag.push(q);
    const picked = [];
    const seen = new Set();
    while (picked.length < count && bag.length) {
      const idx = Math.floor(Math.random() * bag.length);
      const q = bag[idx];
      bag.splice(idx, 1);
      if (!seen.has(String(q._id))) {
        seen.add(String(q._id));
        picked.push(q);
      }
    }
    pool = picked;
  } else {
    // Quick/Deep run the due queue in priority order (overdue & weak first).
    const [overdue, due] = await Promise.all([
      revisionService.getQueue(req.userId, 'overdue', tz, { limit: count }),
      revisionService.getQueue(req.userId, 'due', tz, { limit: count }),
    ]);
    pool = [...overdue, ...due].slice(0, count);
    if (pool.length < count) {
      // Top up with the weakest upcoming questions so a session always works.
      const extra = await Question.find({
        userId: req.userId,
        status: 'solved',
        'revision.nextReviewDate': { $gt: dayBoundsUtc(todayKeyStr).end },
      })
        .sort({ 'revision.memoryStrength': 1 })
        .limit(count - pool.length)
        .lean();
      const have = new Set(pool.map((p) => String(p._id)));
      for (const q of extra) {
        if (pool.length >= count) break;
        if (!have.has(String(q._id))) pool.push(q);
      }
    }
  }

  if (!pool.length) {
    return res.json({ success: true, mode, items: [], message: 'Nothing due — your queue is clear 🎉' });
  }

  // Re-sort by priority (Rules 7 & 8) except random which keeps its order.
  if (mode !== 'random') {
    pool.sort(
      (a, b) =>
        priorityScore({
          nextReviewDate: b.revision?.nextReviewDate,
          memoryStrength: b.revision?.memoryStrength ?? 50,
          weakFlags: b.revision?.weakFlags || [],
          todayKeyStr,
        }) -
        priorityScore({
          nextReviewDate: a.revision?.nextReviewDate,
          memoryStrength: a.revision?.memoryStrength ?? 50,
          weakFlags: a.revision?.weakFlags || [],
          todayKeyStr,
        })
    );
  }

  res.json({
    success: true,
    mode,
    items: pool.map((q) => revisionService.serializeQuestion(q, todayKeyStr)),
  });
});

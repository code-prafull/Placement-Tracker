import mongoose from 'mongoose';
import Question, { DIFFICULTIES } from '../models/Question.js';
import Revision from '../models/Revision.js';
import ApiError from '../utils/ApiError.js';
import { deriveRevisionStatus } from './spacedRepetition.js';
import { bumpSolvedActivity, unbumpSolvedActivity, unbumpRevisionActivity } from './activityService.js';
import { dayBoundsUtc, keyToUtcDate, shiftKey, todayKey } from '../utils/dates.js';

const MAX_LIMIT = 100;

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTopics(value) {
  if (!value) return [];
  const arr = Array.isArray(value)
    ? value
    : String(value)
        .split(/[,;|]/g);
  return [...new Set(arr.map((t) => String(t).trim()).filter(Boolean))].slice(0, 10);
}

/** Coerces free-form examples into {input, output, explanation} rows. */
function normalizeExamples(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [];
  return arr
    .map((e) => ({
      input: String(e?.input ?? '').trim(),
      output: String(e?.output ?? '').trim(),
      explanation: String(e?.explanation ?? '').trim(),
    }))
    .filter((e) => e.input || e.output || e.explanation)
    .slice(0, 6);
}

/** Coerces a textarea (newline separated) or array into a clean string list. */
function normalizeLines(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split('\n');
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))].slice(0, 20);
}

/* -------------------------------------------------------------------------- */
/* Create / update                                                             */
/* -------------------------------------------------------------------------- */

export async function createQuestion(userId, tzOffset, data) {
  const todayKeyStr = todayKey(tzOffset);
  const status = data.status || 'solving';
  const solved = status === 'solved';

  const doc = {
    userId,
    title: String(data.title || '').trim(),
    description: data.description || '',
    platform: data.platform || 'LeetCode',
    externalLink: data.externalLink || data.url || '',
    difficulty: DIFFICULTIES.includes(data.difficulty) ? data.difficulty : 'Medium',
    topics: normalizeTopics(data.topics),
    companies: normalizeTopics(data.companies),
    status,
    notes: data.notes || '',
    approach: data.approach || '',
    code: data.code || '',
    language: data.language || 'C++',
    timeComplexity: data.timeComplexity || '',
    spaceComplexity: data.spaceComplexity || '',
    examples: normalizeExamples(data.examples),
    constraints: normalizeLines(data.constraints),
    hints: normalizeLines(data.hints),
    solvedAt: solved ? new Date() : null,
    solvedDateKey: solved ? todayKeyStr : null,
    revision: { memoryStrength: 50, revisionCount: 0, status: 'new' },
  };

  if (!doc.title) throw new ApiError(400, 'Title is required');

  if (solved) {
    // First revision is scheduled immediately → straight into Today's queue.
    const nextReviewDate = keyToUtcDate(todayKeyStr);
    doc.revision.nextReviewDate = nextReviewDate;
    doc.revision.interval = 0;
    doc.revision.status = deriveRevisionStatus({
      nextReviewDate,
      todayKeyStr,
      memoryStrength: 50,
      interval: 0,
    });
  }

  try {
    const question = await Question.create(doc);
    if (solved) await bumpSolvedActivity(userId, todayKeyStr);
    return question;
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, `“${doc.title}” already exists in your bank`);
    throw err;
  }
}

export async function updateQuestion(userId, tzOffset, id, data) {
  const question = await Question.findOne({ _id: id, userId });
  if (!question) throw new ApiError(404, 'Question not found');

  const todayKeyStr = todayKey(tzOffset);
  const wasSolved = question.status === 'solved';
  const nextStatus = data.status ?? question.status;
  const nowSolved = nextStatus === 'solved';

  const fields = [
    'title', 'description', 'platform', 'externalLink', 'difficulty',
    'notes', 'approach', 'code', 'language', 'timeComplexity', 'spaceComplexity',
  ];
  for (const f of fields) {
    if (data[f] !== undefined) question[f] = f === 'title' ? String(data[f]).trim() : data[f];
  }
  if (data.topics !== undefined) question.topics = normalizeTopics(data.topics);
  if (data.companies !== undefined) question.companies = normalizeTopics(data.companies);
  if (data.examples !== undefined) question.examples = normalizeExamples(data.examples);
  if (data.constraints !== undefined) question.constraints = normalizeLines(data.constraints);
  if (data.hints !== undefined) question.hints = normalizeLines(data.hints);

  // --- solving & revising stay separate activities (Rule 2) ----------------
  // `touchSolvedDate` lets the quick "✓ Solved" action re-stamp an already
  // solved question with today's date (so it counts toward the daily task).
  if (nowSolved && (!wasSolved || data.touchSolvedDate)) {
    question.status = 'solved';
    question.solvedAt = new Date();
    // Only bump activity when the solve-day actually changes, so re-clicking
    // "✓ Solved" for an already-solved-today question can't double count.
    if (question.solvedDateKey !== todayKeyStr) {
      await bumpSolvedActivity(userId, todayKeyStr);
      question.solvedDateKey = todayKeyStr;
    }
    if (!question.revision?.nextReviewDate) {
      const nextReviewDate = keyToUtcDate(todayKeyStr);
      question.revision = {
        ...(question.revision?.toObject?.() || question.revision || {}),
        nextReviewDate,
        interval: question.revision?.interval || 0,
        status: deriveRevisionStatus({
          nextReviewDate,
          todayKeyStr,
          memoryStrength: question.revision?.memoryStrength ?? 50,
          interval: question.revision?.interval || 0,
        }),
      };
    }
  } else if (wasSolved && !nowSolved) {
    // Un-solve: leave revision history intact (Rule 3), just pause scheduling.
    question.status = nextStatus;
    question.revision.nextReviewDate = null;
    question.revision.status = 'new';
    if (question.solvedDateKey) await unbumpSolvedActivity(userId, question.solvedDateKey);
    question.solvedAt = null;
    question.solvedDateKey = null;
  } else {
    question.status = nextStatus;
  }

  try {
    await question.save();
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, `“${question.title}” already exists in your bank`);
    throw err;
  }
  return question;
}

/** Deleting a question safely removes (and reverses) its revision history. */
export async function deleteQuestion(userId, tzOffset, id) {
  const question = await Question.findOne({ _id: id, userId });
  if (!question) throw new ApiError(404, 'Question not found');

  const revisions = await Revision.find({ questionId: question._id, userId })
    .select('result dateKey')
    .lean();

  // Reverse per-day aggregates so the heatmap/streak stay truthful.
  const perDay = new Map();
  for (const r of revisions) {
    if (!r.dateKey) continue;
    const m = perDay.get(r.dateKey) || { n: 0, results: {} };
    m.n += 1;
    m.results[r.result] = (m.results[r.result] || 0) + 1;
    perDay.set(r.dateKey, m);
  }
  for (const [day, m] of perDay) {
    await unbumpRevisionActivity(userId, day, m.results);
  }
  if (question.status === 'solved' && question.solvedDateKey) {
    await unbumpSolvedActivity(userId, question.solvedDateKey);
  }

  await Revision.deleteMany({ questionId: question._id, userId });
  await question.deleteOne();
  return { deleted: true, revisionsRemoved: revisions.length };
}

/* -------------------------------------------------------------------------- */
/* List / search / filter                                                      */
/* -------------------------------------------------------------------------- */

export async function listQuestions(userId, tzOffset, query = {}) {
  const todayKeyStr = todayKey(tzOffset);
  const filter = { userId };

  // --- tab / queue shortcuts ------------------------------------------------
  const tab = query.tab || 'all';
  if (tab === 'solved') filter.status = 'solved';

  // --- explicit filters -----------------------------------------------------
  if (query.status && ['todo', 'solving', 'solved'].includes(query.status)) {
    filter.status = query.status;
  }
  if (query.difficulty) {
    const list = String(query.difficulty).split(',').filter((d) => DIFFICULTIES.includes(d));
    if (list.length) filter.difficulty = { $in: list };
  }
  if (query.topics) {
    const list = String(query.topics).split(',').map((t) => t.trim()).filter(Boolean);
    if (list.length) filter.topics = { $in: list };
  }
  if (query.platform) filter.platform = query.platform;

  const search = String(query.search || '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { title: rx },
      { topics: rx },
      { companies: rx },
      { platform: rx },
      { notes: rx },
      { description: rx },
    ];
  }

  // Memory strength buckets (server-side source of truth).
  const memory = query.memory || (tab === 'strong' ? 'strong' : tab === 'weak' ? 'weak' : tab === 'forgotten' ? 'forgotten' : null);
  if (memory === 'forgotten') {
    filter['revision.revisionCount'] = { $gte: 1 };
    filter['revision.memoryStrength'] = { $lt: 25 };
  } else if (memory === 'weak') {
    filter['revision.revisionCount'] = { $gte: 1 };
    filter['revision.memoryStrength'] = { $lt: 45 };
  } else if (memory === 'learning') {
    filter['revision.memoryStrength'] = { $gte: 45, $lt: 65 };
  } else if (memory === 'strong') {
    filter['revision.memoryStrength'] = { $gte: 65, $lt: 85 };
  } else if (memory === 'mastered') {
    filter['revision.memoryStrength'] = { $gte: 85 };
  }

  // Revision schedule filters.
  const today = dayBoundsUtc(todayKeyStr);
  const revStatus = query.revisionStatus || (tab === 'due' ? 'due' : null);
  if (revStatus === 'due') {
    filter.status = 'solved';
    filter['revision.nextReviewDate'] = { $gte: today.start, $lt: today.end };
  } else if (revStatus === 'overdue') {
    filter.status = 'solved';
    filter['revision.nextReviewDate'] = { $lt: today.start };
  } else if (revStatus === 'dueOrOverdue') {
    filter.status = 'solved';
    filter['revision.nextReviewDate'] = { $lt: today.end };
  } else if (revStatus === 'upcoming') {
    filter.status = 'solved';
    filter['revision.nextReviewDate'] = { $gte: today.end };
  } else if (revStatus === 'never') {
    filter.$and = (filter.$and || []).concat([
      { $or: [{ 'revision.nextReviewDate': null }, { 'revision.revisionCount': 0 }] },
    ]);
  } else if (revStatus === 'recent') {
    filter['revision.lastReviewedAt'] = { $gte: new Date(Date.now() - 7 * 86400000) };
  }

  const lastRevised = query.lastRevised;
  if (lastRevised === 'never') {
    filter['revision.lastReviewedAt'] = null;
  } else if (lastRevised && Number(lastRevised) > 0) {
    filter['revision.lastReviewedAt'] = {
      $gte: new Date(Date.now() - Number(lastRevised) * 86400000),
    };
  }

  if (query.nextReview === 'today') {
    filter.status = 'solved';
    filter['revision.nextReviewDate'] = { $gte: today.start, $lt: today.end };
  } else if (query.nextReview === 'overdue') {
    filter.status = 'solved';
    filter['revision.nextReviewDate'] = { $lt: today.start };
  } else if (query.nextReview === 'week') {
    filter.status = 'solved';
    filter['revision.nextReviewDate'] = { $lt: dayBoundsUtc(shiftKey(todayKeyStr, 7)).end };
  }

  // --- pagination + sorting -------------------------------------------------
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || 25));
  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    title: { title: 1 },
    difficulty: { difficulty: 1 },
    memory: { 'revision.memoryStrength': -1 },
    nextReview: { 'revision.nextReviewDate': 1 },
    lastReviewed: { 'revision.lastReviewedAt': -1 },
  };
  const sort = sortMap[query.sort] || sortMap.nextReview;

  const [items, total] = await Promise.all([
    Question.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
    Question.countDocuments(filter),
  ]);

  return {
    items: items.map((q) => withDerived(q, todayKeyStr)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

function withDerived(q, todayKeyStr) {
  const obj = typeof q.toJSON === 'function' ? q.toJSON() : { ...q };
  const rev = obj.revision || {};
  const dueKey = rev.nextReviewDate ? new Date(rev.nextReviewDate).toISOString().slice(0, 10) : null;
  let derived = rev.status || 'new';
  let days = null;
  if (dueKey) {
    days = Math.round(
      (Date.parse(`${dueKey}T00:00:00Z`) - Date.parse(`${todayKeyStr}T00:00:00Z`)) / 86400000
    );
    if (days < 0) derived = 'overdue';
    else if (days === 0) derived = 'due';
    else if ((rev.memoryStrength ?? 0) >= 85 && (rev.interval ?? 0) >= 30) derived = 'mastered';
    else derived = 'scheduled';
  }
  const s = rev.memoryStrength ?? 50;
  obj.revision = {
    ...rev,
    derivedStatus: derived,
    daysUntilReview: days,
    category: s < 25 ? 'Forgotten' : s < 45 ? 'Weak' : s < 65 ? 'Learning' : s < 85 ? 'Strong' : 'Mastered',
  };
  return obj;
}

/** Distinct facets for filter dropdowns. */
export async function getFacets(userId) {
  const [topics, companies, platforms] = await Promise.all([
    Question.distinct('topics', { userId }),
    Question.distinct('companies', { userId }),
    Question.distinct('platform', { userId }),
  ]);
  return {
    topics: topics.filter(Boolean).sort(),
    companies: companies.filter(Boolean).sort(),
    platforms: platforms.filter(Boolean).sort(),
    difficulties: DIFFICULTIES,
  };
}

/* -------------------------------------------------------------------------- */
/* Bulk operations (spec §25)                                                  */
/* -------------------------------------------------------------------------- */

export async function bulkAction(userId, tzOffset, { action, ids = [], payload = {} }) {
  if (!Array.isArray(ids) || ids.length === 0) throw new ApiError(400, 'No questions selected');
  const validIds = ids.filter((i) => mongoose.isValidObjectId(i));
  if (!validIds.length) throw new ApiError(400, 'Invalid question ids');

  const filter = { _id: { $in: validIds }, userId };
  const todayKeyStr = todayKey(tzOffset);

  switch (action) {
    case 'delete': {
      const docs = await Question.find(filter).select('solvedDateKey status').lean();
      const revs = await Revision.find({ questionId: { $in: validIds }, userId })
        .select('questionId result dateKey')
        .lean();
      const perDay = new Map();
      for (const r of revs) {
        if (!r.dateKey) continue;
        const m = perDay.get(r.dateKey) || { n: 0, results: {} };
        m.n += 1;
        m.results[r.result] = (m.results[r.result] || 0) + 1;
        perDay.set(r.dateKey, m);
      }
      for (const [day, m] of perDay) await unbumpRevisionActivity(userId, day, m.results);
      for (const d of docs) {
        if (d.status === 'solved' && d.solvedDateKey) await unbumpSolvedActivity(userId, d.solvedDateKey);
      }
      await Revision.deleteMany({ questionId: { $in: validIds }, userId });
      const res = await Question.deleteMany(filter);
      return { affected: res.deletedCount || 0 };
    }

    case 'markSolved': {
      const docs = await Question.find({ ...filter, status: { $ne: 'solved' } });
      let affected = 0;
      for (const doc of docs) {
        doc.status = 'solved';
        doc.solvedAt = new Date();
        doc.solvedDateKey = todayKeyStr;
        if (!doc.revision?.nextReviewDate) {
          const nextReviewDate = keyToUtcDate(todayKeyStr);
          doc.revision = {
            ...(doc.revision?.toObject?.() || doc.revision || {}),
            nextReviewDate,
            status: deriveRevisionStatus({
              nextReviewDate,
              todayKeyStr,
              memoryStrength: doc.revision?.memoryStrength ?? 50,
              interval: 0,
            }),
          };
        }
        await doc.save();
        await bumpSolvedActivity(userId, todayKeyStr);
        affected++;
      }
      return { affected };
    }

    case 'scheduleRevision': {
      // Pull every selected question into today's queue.
      const date = payload.date === 'tomorrow' ? shiftKey(todayKeyStr, 1) : todayKeyStr;
      const nextReviewDate = keyToUtcDate(date);
      const res = await Question.updateMany(
        { ...filter, status: 'solved' },
        {
          $set: {
            'revision.nextReviewDate': nextReviewDate,
            'revision.status': date === todayKeyStr ? 'due' : 'scheduled',
          },
        }
      );
      return { affected: res.modifiedCount || 0 };
    }

    case 'changeTopic': {
      const topics = normalizeTopics(payload.topics);
      if (!topics.length) throw new ApiError(400, 'Provide topics');
      const res = await Question.updateMany(filter, { $set: { topics } });
      return { affected: res.modifiedCount || 0 };
    }

    case 'addTopic': {
      const topic = String(payload.topic || '').trim();
      if (!topic) throw new ApiError(400, 'Provide a topic');
      const res = await Question.updateMany(filter, { $addToSet: { topics: topic } });
      return { affected: res.modifiedCount || 0 };
    }

    case 'changeDifficulty': {
      if (!DIFFICULTIES.includes(payload.difficulty)) throw new ApiError(400, 'Invalid difficulty');
      const res = await Question.updateMany(filter, { $set: { difficulty: payload.difficulty } });
      return { affected: res.modifiedCount || 0 };
    }

    default:
      throw new ApiError(400, `Unknown bulk action: ${action}`);
  }
}

export { withDerived };

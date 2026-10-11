import mongoose from 'mongoose';
import Question from '../models/Question.js';
import InterviewSession from '../models/InterviewSession.js';
import ApiError from '../utils/ApiError.js';
import { priorityScore } from './spacedRepetition.js';
import { todayKey } from '../utils/dates.js';

/**
 * Build an interview session from questions the user has ALREADY solved.
 * Never introduces new questions — it tests recall.
 *
 * Selection: prioritise forgotten/weak/overdue/due, spread across topics
 * (≈1 question per topic when possible).
 */
export async function createInterviewSession(userId, tzOffset, { count = 5, topics = [] } = {}) {
  const todayKeyStr = todayKey(tzOffset);

  const filter = { userId, status: 'solved' };
  if (topics.length) filter.topics = { $in: topics };

  const pool = await Question.find(filter).limit(1000).lean();
  if (pool.length === 0) {
    throw new ApiError(400, 'No solved questions yet — solve and store questions first');
  }

  const scored = pool.map((q) => ({
    q,
    score: priorityScore({
      nextReviewDate: q.revision?.nextReviewDate,
      memoryStrength: q.revision?.memoryStrength ?? 50,
      weakFlags: q.revision?.weakFlags || [],
      todayKeyStr,
    }),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Greedy round-robin over topics so the mock interview covers many areas.
  const byTopic = new Map();
  for (const { q, score } of scored) {
    const primary = (q.topics && q.topics[0]) || 'General';
    if (!byTopic.has(primary)) byTopic.set(primary, []);
    byTopic.get(primary).push({ q, score });
  }

  const picked = [];
  const pickedIds = new Set();
  let round = 0;
  while (picked.length < count && round < 50) {
    let added = false;
    for (const list of byTopic.values()) {
      if (picked.length >= count) break;
      const item = list[round];
      if (item && !pickedIds.has(String(item.q._id))) {
        pickedIds.add(String(item.q._id));
        picked.push(item.q);
        added = true;
      }
    }
    if (!added) break;
    round++;
  }

  // Still short → fill with the highest priority leftovers.
  if (picked.length < count) {
    for (const { q } of scored) {
      if (picked.length >= count) break;
      if (!pickedIds.has(String(q._id))) {
        pickedIds.add(String(q._id));
        picked.push(q);
      }
    }
  }

  const topicBreakdown = {};
  for (const q of picked) {
    const primary = (q.topics && q.topics[0]) || 'General';
    topicBreakdown[primary] = (topicBreakdown[primary] || 0) + 1;
  }

  const session = await InterviewSession.create({
    userId,
    questionIds: picked.map((q) => q._id),
    topicBreakdown: Object.entries(topicBreakdown).map(([topic, n]) => ({ topic, count: n })),
    status: 'active',
    startedAt: new Date(),
  });

  return serializeSession(session, picked);
}

/** Client-safe session payload (NO answers/solutions up front). */
export function serializeSession(session, questions) {
  const qs = questions || [];
  const map = new Map(qs.map((q) => [String(q._id), q]));
  return {
    id: session._id,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    topicBreakdown: session.topicBreakdown,
    score: session.score,
    total: session.total || (session.questionIds?.length ?? 0),
    weakArea: session.weakArea,
    questions: (session.questionIds || []).map((id) => {
      const q = map.get(String(id));
      return q
        ? {
            id: q._id,
            title: q.title,
            difficulty: q.difficulty,
            topics: q.topics,
            // only metadata — the user must recall the rest
            hasApproach: Boolean(q.approach),
            hasCode: Boolean(q.code),
          }
        : { id, title: '(deleted question)', difficulty: 'Medium', topics: [] };
    }),
  };
}

export async function loadSession(userId, sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) throw new ApiError(400, 'Invalid session id');
  const session = await InterviewSession.findOne({ _id: sessionId, userId });
  if (!session) throw new ApiError(404, 'Interview session not found');
  const questions = await Question.find({
    _id: { $in: session.questionIds },
    userId,
  }).lean();
  return { session, questions };
}

/** Save recall answers and compute score + weak area. */
export async function completeInterview(userId, sessionId, answers) {
  const { session, questions } = await loadSession(userId, sessionId);
  if (session.status === 'completed') {
    return serializeSession(session, questions); // idempotent
  }

  const answerList = Array.isArray(answers) ? answers : [];
  const byId = new Map(questions.map((q) => [String(q._id), q]));

  const normalized = answerList
    .filter((a) => a && mongoose.isValidObjectId(a.questionId) && byId.has(String(a.questionId)))
    .map((a) => ({ questionId: a.questionId, recalled: Boolean(a.recalled) }));

  const score = normalized.filter((a) => a.recalled).length;

  // Weak area = topic with the most missed questions (fall back to lowest memory).
  const missByTopic = new Map();
  for (const a of normalized) {
    if (a.recalled) continue;
    const q = byId.get(String(a.questionId));
    for (const t of q?.topics || ['General']) {
      missByTopic.set(t, (missByTopic.get(t) || 0) + 1);
    }
  }
  let weakArea = '';
  if (missByTopic.size > 0) {
    weakArea = [...missByTopic.entries()].sort((a, b) => b[1] - a[1])[0][0];
  } else if (questions.length) {
    // all recalled → weakest by memory strength
    const sorted = [...questions].sort(
      (a, b) => (a.revision?.memoryStrength ?? 50) - (b.revision?.memoryStrength ?? 50)
    );
    weakArea = sorted[0]?.topics?.[0] || '';
  }

  session.answers = normalized;
  session.score = score;
  session.total = normalized.length;
  session.weakArea = weakArea;
  session.status = 'completed';
  session.completedAt = new Date();
  await session.save();

  return serializeSession(session, questions);
}

export async function listSessions(userId, limit = 10) {
  const sessions = await InterviewSession.find({ userId })
    .sort({ startedAt: -1 })
    .limit(limit)
    .lean();
  return sessions.map((s) => ({
    id: s._id,
    status: s.status,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    score: s.score,
    total: s.total || s.questionIds?.length || 0,
    weakArea: s.weakArea,
    topicBreakdown: s.topicBreakdown,
  }));
}

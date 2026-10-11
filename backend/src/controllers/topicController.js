import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getTopicStats, getWeakTopics } from '../services/topicService.js';
import { serializeQuestion, getQueue } from '../services/revisionService.js';
import Question from '../models/Question.js';
import { todayKey } from '../utils/dates.js';

/** GET /api/topics — roadmap stats per topic (spec §27) */
export const list = asyncHandler(async (req, res) => {
  const topics = await getTopicStats(req.userId);
  res.json({ success: true, topics });
});

/** GET /api/topics/weak — weakest topics + the weakest of all */
export const weak = asyncHandler(async (req, res) => {
  const weakTopics = await getWeakTopics(req.userId, 10);
  res.json({
    success: true,
    weakTopics,
    weakest: weakTopics[0] || null,
  });
});

/**
 * GET /api/topics/:name/questions?memory=weak&revisionStatus=due
 * Every topic drill-down page needs (e.g. "show all weak DP questions").
 */
export const topicQuestions = asyncHandler(async (req, res) => {
  const name = String(req.params.name || '').trim();
  if (!name) throw new ApiError(400, 'Topic name required');

  const filter = { userId: req.userId, status: 'solved', topics: name };
  const memory = req.query.memory;
  if (memory === 'weak') {
    filter['revision.revisionCount'] = { $gte: 1 };
    filter['revision.memoryStrength'] = { $lt: 45 };
  } else if (memory === 'forgotten') {
    filter['revision.revisionCount'] = { $gte: 1 };
    filter['revision.memoryStrength'] = { $lt: 25 };
  } else if (memory === 'mastered') {
    filter['revision.memoryStrength'] = { $gte: 85 };
  }

  const todayKeyStr = todayKey(req.tzOffset);
  if (req.query.due === 'true') {
    // due today or overdue → anything strictly before tomorrow's local day
    const tomorrow = new Date(Date.parse(`${todayKeyStr}T00:00:00Z`) + 86400000)
      .toISOString()
      .slice(0, 10);
    filter['revision.nextReviewDate'] = { $lt: new Date(`${tomorrow}T00:00:00.000Z`) };
  }

  const docs = await Question.find(filter)
    .sort({ 'revision.nextReviewDate': 1 })
    .limit(200);

  // Priority order for "Revise Weak Questions"
  const items = docs
    .map((d) => serializeQuestion(d, todayKeyStr))
    .sort((a, b) => (b.revision?.priority ?? 0) - (a.revision?.priority ?? 0));

  res.json({ success: true, topic: name, items });
});

/** GET /api/topics/revision-queue — weak questions from a topic, ready to session */
export const weakRevision = asyncHandler(async (req, res) => {
  const name = String(req.query.topic || '').trim();
  if (!name) throw new ApiError(400, 'topic query param required');
  const all = await getQueue(req.userId, 'weak', req.tzOffset, { limit: 500 });
  res.json({ success: true, items: all.filter((q) => (q.topics || []).includes(name)) });
});

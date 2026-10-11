import Question from '../models/Question.js';
import Revision from '../models/Revision.js';
import DailyTask from '../models/DailyTask.js';
import { dayBoundsUtc, todayKey } from '../utils/dates.js';

/** Small deterministic PRNG so the same user gets the same 3 tasks all day. */
function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function rnd() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Today's 3-question task (spec-lite: "daily 3 random questions").
 * Picks are stable for the whole local day, weighted so weak/overdue and
 * not-yet-solved questions surface first.
 */
export async function getDailyTask(userId, tzOffset, count = 3) {
  const dateKeyStr = todayKey(tzOffset);

  // The pick is frozen per (user, day): once today's 3 exist we never reshuffle
  // them — solving one just flips its done flag. This is what makes the daily
  // task feel like a real checklist instead of a slot machine.
  let frozen = await DailyTask.findOne({ userId, dateKey: dateKeyStr }).lean();

  if (!frozen) {
    const all = await Question.find({ userId })
      .select('title topics difficulty status revision solvedAt solvedDateKey externalLink platform')
      .lean();

    const rnd = mulberry32(seedFrom(`${userId}:${dateKeyStr}`));

    const scored = all.map((q) => {
      const rev = q.revision || {};
      const overdue = (rev.daysUntilReview ?? 0) < 0;
      const due = (rev.daysUntilReview ?? 0) <= 0;
      const strength = rev.memoryStrength ?? 50;

      let score = rnd(); // base randomness
      if (q.status === 'todo') score += 6;
      if (q.status === 'solving') score += 4;
      if (overdue) score += 5;
      else if (due) score += 3;
      if (q.status === 'solved' && strength < 45) score += 3;
      return { q, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Topic-diverse combination: prefer questions whose topics haven't been used
    // yet so the daily 3 always feels like a mixed set, falling back to score.
    const picked = [];
    const usedTopics = new Set();
    const pool = [...scored];
    while (picked.length < count && pool.length) {
      let idx = pool.findIndex((c) => (c.q.topics || []).every((t) => !usedTopics.has(t)));
      if (idx === -1) idx = 0;
      const [choice] = pool.splice(idx, 1);
      picked.push(choice);
      for (const t of choice.q.topics || []) usedTopics.add(t);
    }

    if (!picked.length) {
      return { date: dateKeyStr, total: count, completed: 0, items: [] };
    }

    // Persist the pick; a concurrent request that lost the race just re-reads.
    await DailyTask.updateOne(
      { userId, dateKey: dateKeyStr },
      { $setOnInsert: { userId, dateKey: dateKeyStr, questionIds: picked.map((c) => c.q._id) } },
      { upsert: true }
    ).catch(() => {});
    frozen = await DailyTask.findOne({ userId, dateKey: dateKeyStr }).lean();
  }

  const ids = (frozen?.questionIds || []).slice(0, count);
  if (!ids.length) return { date: dateKeyStr, total: count, completed: 0, items: [] };

  const [questions, revisedRows] = await Promise.all([
    Question.find({ userId, _id: { $in: ids } })
      .select('title topics difficulty status revision solvedAt solvedDateKey externalLink platform')
      .lean(),
    Revision.find({ userId, status: 'completed', dateKey: dateKeyStr, questionId: { $in: ids } })
      .select('questionId')
      .lean(),
  ]);

  const revisedToday = new Set(revisedRows.map((r) => String(r.questionId)));
  const byId = new Map(questions.map((q) => [String(q._id), q]));

  // Return in frozen pick order; drop ids whose question was deleted.
  const items = ids
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((q) => {
      const isSolvedToday = q.solvedDateKey === dateKeyStr;
      return {
        _id: q._id,
        title: q.title,
        topics: q.topics || [],
        difficulty: q.difficulty,
        status: q.status,
        memoryStrength: q.revision?.memoryStrength ?? null,
        externalLink: q.externalLink || '',
        done: isSolvedToday || revisedToday.has(String(q._id)),
      };
    });

  return {
    date: dateKeyStr,
    total: items.length,
    completed: items.filter((i) => i.done).length,
    items,
  };
}

/**
 * Weekly performance % (0-100) for the habit page.
 * Blend: active days (40%) + revisions vs goal (35%) + solves vs goal (25%).
 */
export async function getWeeklyPerformance(userId, tzOffset, goals = {}) {
  const revisionGoal = Math.max(1, Number(goals.dailyRevisionGoal) || 10);
  const solveGoal = Math.max(1, Number(goals.dailySolveGoal) || 3);

  const end = todayKey(tzOffset);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(`${end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const start = days[0];
  const { start: from } = dayBoundsUtc(start);
  const { end: to } = dayBoundsUtc(end);

  const [revisions, solved] = await Promise.all([
    Revision.find({ userId, status: 'completed', dateKey: { $gte: start, $lte: end } })
      .select('dateKey')
      .lean(),
    Question.find({ userId, status: 'solved', solvedAt: { $gte: from, $lte: to } })
      .select('solvedDateKey')
      .lean(),
  ]);

  const perDay = {};
  days.forEach((d) => (perDay[d] = { date: d, revisions: 0, solved: 0 }));
  revisions.forEach((r) => {
    if (perDay[r.dateKey]) perDay[r.dateKey].revisions += 1;
  });
  solved.forEach((q) => {
    const k = q.solvedDateKey;
    if (perDay[k]) perDay[k].solved += 1;
  });

  const week = days.map((d) => perDay[d]);
  const activeDays = week.filter((w) => w.revisions > 0 || w.solved > 0).length;
  const totalRevisions = week.reduce((s, w) => s + w.revisions, 0);
  const totalSolved = week.reduce((s, w) => s + w.solved, 0);

  const activeScore = (activeDays / 7) * 40;
  const revisionScore = Math.min(1, totalRevisions / (revisionGoal * 7)) * 35;
  const solveScore = Math.min(1, totalSolved / (solveGoal * 7)) * 25;
  const percent = Math.round(activeScore + revisionScore + solveScore);

  let grade = 'Needs work';
  if (percent >= 85) grade = 'Excellent';
  else if (percent >= 70) grade = 'Good';
  else if (percent >= 50) grade = 'Okay';

  return {
    percent,
    grade,
    activeDays,
    totalRevisions,
    totalSolved,
    goals: { dailyRevisionGoal: revisionGoal, dailySolveGoal: solveGoal },
    days: week,
  };
}

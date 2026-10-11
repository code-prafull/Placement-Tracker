import Question from '../models/Question.js';
import Revision from '../models/Revision.js';
import { getStreak } from './activityService.js';
import { categoryFromStrength, RATING_VALUE } from './spacedRepetition.js';
import { dateKey, shiftKey, todayKey } from '../utils/dates.js';

/**
 * Full analytics payload (spec §20). Everything is aggregated from the
 * Revision / Question collections — the backend stays the source of truth.
 */
export async function getAnalytics(userId, tzOffset) {
  const today = todayKey(tzOffset);

  const [questions, revisions, streak] = await Promise.all([
    Question.find({ userId, status: 'solved' })
      .select('topics difficulty revision solvedAt createdAt')
      .lean(),
    Revision.find({ userId, status: 'completed' })
      .select('result reviewedAt dateKey nextInterval previousInterval questionId secondsSpent')
      .sort({ reviewedAt: 1 })
      .lean(),
    getStreak(userId, tzOffset),
  ]);

  /* ---- headline numbers ---- */
  const totalQuestions = questions.length;
  const totalRevisions = revisions.length;
  const mastered = questions.filter((q) => (q.revision?.memoryStrength ?? 50) >= 85).length;
  const weak = questions.filter(
    (q) =>
      (q.revision?.revisionCount || 0) > 0 &&
      ((q.revision?.memoryStrength ?? 50) < 45 || (q.revision?.weakFlags || []).length > 0)
  ).length;
  const forgotten = questions.filter(
    (q) =>
      (q.revision?.revisionCount || 0) > 0 && (q.revision?.memoryStrength ?? 50) < 25
  ).length;

  let recallSum = 0;
  for (const r of revisions) recallSum += RATING_VALUE[r.result] ?? 0;
  const avgRecall = revisions.length ? Math.round(recallSum / revisions.length) : 0;

  /* ---- memory strength distribution ---- */
  const buckets = { Forgotten: 0, Weak: 0, Learning: 0, Strong: 0, Mastered: 0 };
  for (const q of questions) {
    buckets[categoryFromStrength(q.revision?.memoryStrength ?? 50)] += 1;
  }
  const memoryDistribution = Object.entries(buckets).map(([name, value]) => ({ name, value }));

  /* ---- topic-wise memory ---- */
  const topicMap = new Map();
  for (const q of questions) {
    for (const raw of q.topics || []) {
      const name = String(raw || '').trim();
      if (!name) continue;
      if (!topicMap.has(name)) topicMap.set(name, { sum: 0, n: 0, revised: 0, total: 0 });
      const t = topicMap.get(name);
      t.total += 1;
      if ((q.revision?.revisionCount || 0) > 0) {
        t.sum += q.revision?.memoryStrength ?? 50;
        t.n += 1;
        t.revised += 1;
      }
    }
  }
  const topicMemory = [...topicMap.entries()]
    .map(([topic, t]) => ({
      topic,
      memory: t.n > 0 ? Math.round(t.sum / t.n) : null,
      questions: t.total,
      revised: t.revised,
    }))
    .filter((t) => t.memory !== null)
    .sort((a, b) => a.memory - b.memory);

  /* ---- daily series (last 30 days) ---- */
  const days = [];
  for (let i = 29; i >= 0; i--) days.push(shiftKey(today, -i));
  const revByDay = new Map();
  for (const r of revisions) {
    if (!r.dateKey) continue;
    revByDay.set(r.dateKey, (revByDay.get(r.dateKey) || 0) + 1);
  }
  const solvedByDay = new Map();
  const resultByDay = new Map();
  for (const q of questions) {
    if (q.solvedDateKey) solvedByDay.set(q.solvedDateKey, (solvedByDay.get(q.solvedDateKey) || 0) + 1);
  }
  for (const r of revisions) {
    if (!r.dateKey) continue;
    const m = resultByDay.get(r.dateKey) || { forgot: 0, hard: 0, good: 0, easy: 0 };
    m[r.result] = (m[r.result] || 0) + 1;
    resultByDay.set(r.dateKey, m);
  }

  const revisionActivity = days.map((d) => ({
    date: d,
    revisions: revByDay.get(d) || 0,
    solved: solvedByDay.get(d) || 0,
    forgot: resultByDay.get(d)?.forgot || 0,
    good: resultByDay.get(d)?.good || 0,
    easy: resultByDay.get(d)?.easy || 0,
    hard: resultByDay.get(d)?.hard || 0,
  }));

  /* ---- revision frequency: revisions per week (12 weeks) ---- */
  const revisionFrequency = [];
  for (let w = 11; w >= 0; w--) {
    const end = shiftKey(today, -w * 7);
    const start = shiftKey(end, -6);
    const count = revisions.filter((r) => r.dateKey && r.dateKey >= start && r.dateKey <= end).length;
    revisionFrequency.push({ week: start, label: `${start}`, revisions: count });
  }

  /* ---- forgotten questions over time (30 days, built from history) ---- */
  const forgottenOverTime = buildForgottenTimeline(revisions, days);

  /* ---- interval distribution (how far apart reviews actually happen) ---- */
  const intervalMap = new Map();
  for (const r of revisions) {
    const iv = r.nextInterval || 0;
    if (iv <= 0) continue;
    const bucket = iv <= 1 ? '1d' : iv <= 3 ? '2-3d' : iv <= 7 ? '4-7d' : iv <= 14 ? '8-14d' : iv <= 30 ? '15-30d' : '30d+';
    intervalMap.set(bucket, (intervalMap.get(bucket) || 0) + 1);
  }
  const order = ['1d', '2-3d', '4-7d', '8-14d', '15-30d', '30d+'];
  const intervalDistribution = order
    .filter((b) => intervalMap.has(b))
    .map((b) => ({ name: b, value: intervalMap.get(b) }));

  const totalSeconds = revisions.reduce((s, r) => s + (r.secondsSpent || 0), 0);

  return {
    totals: {
      totalQuestions,
      totalRevisions,
      mastered,
      weak,
      forgotten,
      avgRecall,
      revisionStreak: streak.current,
      longestStreak: streak.longest,
      totalRevisionDays: streak.totalDays,
      totalRevisionMinutes: Math.round(totalSeconds / 60),
      avgInterval:
        revisions.length > 0
          ? Math.round(
              (revisions.reduce((s, r) => s + (r.nextInterval || 0), 0) / revisions.length) * 10
            ) / 10
          : 0,
    },
    memoryDistribution,
    topicMemory,
    revisionActivity,
    revisionFrequency,
    intervalDistribution,
    forgottenOverTime,
    resultSplit: resultTotals(revisions),
    streak,
  };
}

function resultTotals(revisions) {
  const out = { forgot: 0, hard: 0, good: 0, easy: 0 };
  for (const r of revisions) out[r.result] = (out[r.result] || 0) + 1;
  return Object.entries(out).map(([name, value]) => ({ name, value }));
}

/**
 * For each day, how many questions were in a "forgotten" state: a question is
 * forgotten from the moment it was rated `forgot` until its next revision.
 */
function buildForgottenTimeline(revisions, days) {
  const byQuestion = new Map();
  for (const r of revisions) {
    if (!r.questionId) continue;
    if (!byQuestion.has(String(r.questionId))) byQuestion.set(String(r.questionId), []);
    byQuestion.get(String(r.questionId)).push(r);
  }

  // For each question build [stateStartKey, stateEndKey, forgotten?]
  const intervals = [];
  for (const list of byQuestion.values()) {
    list.sort((a, b) => new Date(a.reviewedAt) - new Date(b.reviewedAt));
    list.forEach((r, i) => {
      const start = r.dateKey;
      const end = i + 1 < list.length ? list[i + 1].dateKey : '9999-12-31';
      if (start) intervals.push([start, end, r.result === 'forgot']);
    });
  }

  return days.map((d) => ({
    date: d,
    forgotten: intervals.filter(([s, e, f]) => f && s <= d && d < e).length,
  }));
}

import Question from '../models/Question.js';
import Revision from '../models/Revision.js';
import DailyActivity from '../models/DailyActivity.js';
import { getQueueCounts, getQueue, serializeQuestion } from './revisionService.js';
import { getStreak, getDayCounts } from './activityService.js';
import { getTopicStats, getWeakTopics } from './topicService.js';
import { dayBoundsUtc, shiftKey, todayKey } from '../utils/dates.js';

/**
 * One aggregated payload for the dashboard (spec §32) so the frontend makes a
 * single request. Revision is always the first thing this returns.
 */
export async function getDashboard(userId, tzOffset) {
  const todayKeyStr = todayKey(tzOffset);
  const today = dayBoundsUtc(todayKeyStr);

  const [
    queues,
    streak,
    dayCounts,
    solvedCount,
    masteredCount,
    weakQuestions,
    weakTopics,
    topicProgress,
    todayDone,
    recentActivity,
    totalRevisions,
  ] = await Promise.all([
    getQueueCounts(userId, tzOffset),
    getStreak(userId, tzOffset),
    getDayCounts(userId, todayKeyStr),
    Question.countDocuments({ userId, status: 'solved' }),
    Question.countDocuments({ userId, status: 'solved', 'revision.memoryStrength': { $gte: 85 } }),
    getQueue(userId, 'weak', tzOffset, { limit: 100 }),
    getWeakTopics(userId, 5),
    getTopicStats(userId),
    Revision.countDocuments({ userId, status: 'completed', dateKey: todayKeyStr }),
    Revision.find({ userId, status: 'completed' })
      .sort({ reviewedAt: -1 })
      .limit(8)
      .populate({ path: 'questionId', select: 'title topics difficulty' })
      .lean(),
    Revision.countDocuments({ userId, status: 'completed' }),
  ]);

  const dueTotal = queues.due + queues.overdue;
  const revisedToday = Math.max(dayCounts.revised, todayDone);
  const progress =
    dueTotal > 0
      ? Math.min(100, Math.round((revisedToday / (revisedToday + dueTotal)) * 100))
      : 100;

  // --- Today's plan (revision first, always — spec §22) --------------------
  const plan = [];
  if (queues.overdue > 0) plan.push({ icon: 'flame', text: `Revise ${queues.overdue} overdue question${queues.overdue === 1 ? '' : 's'}`, link: '/revision?queue=overdue', priority: 1 });
  const weakDue = weakQuestions.filter((q) => (q.revision?.daysUntilReview ?? 0) <= 0).length;
  const weakCount = weakQuestions.length;
  if (weakCount > 0) plan.push({ icon: 'shield-alert', text: `Revise ${Math.min(weakCount, Math.max(weakDue, 1))} weak question${weakCount === 1 ? '' : 's'}`, link: '/revision/weak', priority: 2 });
  if (queues.due > 0) plan.push({ icon: 'calendar-check', text: `Clear ${queues.due} question${queues.due === 1 ? '' : 's'} due today`, link: '/revision', priority: 3 });
  const goal = 3;
  const solveLeft = Math.max(0, goal - dayCounts.solved);
  if (solveLeft > 0) plan.push({ icon: 'plus-circle', text: `Solve ${solveLeft} new question${solveLeft === 1 ? '' : 's'}`, link: '/questions/new', priority: 4 });
  if (weakTopics.length > 0) {
    const t = weakTopics[0];
    plan.push({ icon: 'target', text: `Review ${t.name} questions (weakest topic — ${t.memory}% memory)`, link: `/questions?topics=${encodeURIComponent(t.name)}&memory=weak`, priority: 5 });
  }

  const solvedToday = await Question.countDocuments({
    userId,
    status: 'solved',
    solvedDateKey: todayKeyStr,
  });

  return {
    todayRevision: {
      due: queues.due,
      overdue: queues.overdue,
      total: dueTotal,
      revisedToday,
      solvedToday,
      progress,
    },
    overdueRevision: queues.overdue,
    dueRevision: queues.due,
    upcomingRevision: queues.upcoming,
    weakCount: queues.difficult,
    forgottenCount: queues.forgotten,
    masteredCount,
    revisionStreak: streak,
    solvedCount,
    revisedCount: totalRevisions,
    weakQuestions: weakQuestions.slice(0, 6),
    weakTopics,
    topicProgress,
    recentActivity: recentActivity.map((r) => ({
      id: r._id,
      type: 'revision',
      result: r.result,
      reviewedAt: r.reviewedAt,
      title: r.questionId?.title || '(deleted)',
      topics: r.questionId?.topics || [],
      difficulty: r.questionId?.difficulty,
    })),
    habit: { solved: dayCounts.solved, revised: revisedToday, date: todayKeyStr },
    plan: plan.sort((a, b) => a.priority - b.priority).slice(0, 5),
    queueCounts: queues,
    solvedYesterday: await solvedYesterdayCount(userId, tzOffset),
  };
}

async function solvedYesterdayCount(userId, tzOffset) {
  const yesterday = shiftKey(todayKey(tzOffset), -1);
  const { start, end } = dayBoundsUtc(yesterday);
  return Question.countDocuments({ userId, status: 'solved', solvedAt: { $gte: start, $lt: end } });
}

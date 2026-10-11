import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Play, Flame, CalendarClock, CalendarDays, Award, ShieldAlert,
  ArrowRight, CheckCircle2, Repeat2, Lightbulb, TrendingDown, PlusCircle,
} from 'lucide-react';
import { getDashboard, getHeatmap } from '../services/statsService';
import { getTodayTask, getWeeklyPerformance } from '../services/taskService';
import { LoadingState } from '../components/common/Loading';
import { ErrorState as Err } from '../components/common/States';
import { useAuth } from '../context/AuthContext';
import { Card, SectionTitle } from '../components/common/Layout';
import { ProgressBar } from '../components/common/Meters';
import { CategoryBadge, DifficultyBadge, ResultBadge, TopicChip } from '../components/common/Badges';
import Heatmap from '../components/revision/Heatmap';
import { greeting, formatDate, relativeTime } from '../utils/dates';

const PLAN_ICONS = {
  flame: Flame,
  'shield-alert': ShieldAlert,
  'calendar-check': CalendarDays,
  'plus-circle': PlusCircle,
  target: TrendingDown,
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [heat, setHeat] = useState(null);
  const [task, setTask] = useState(null);
  const [week, setWeek] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const [dash, hm, tk, wk] = await Promise.all([
        getDashboard(),
        getHeatmap(18),
        getTodayTask(),
        getWeeklyPerformance(),
      ]);
      setData(dash);
      setHeat(hm.days);
      setTask(tk.task);
      setWeek(wk.performance);
      setError('');
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingState label="Crunching your revision data…" />;
  if (error) return <Err title="Dashboard unavailable" message={error} onRetry={load} />;
  if (!data) return null;

  const rev = data.todayRevision;
  const hasDue = rev.total > 0;

  const stats = [
    { label: 'Overdue', value: data.overdueRevision, icon: Flame, accent: 'text-rose-400 bg-rose-500/10', link: '/revision?queue=overdue' },
    { label: 'Due Today', value: data.dueRevision, icon: CalendarDays, accent: 'text-amber-400 bg-amber-500/10', link: '/revision' },
    { label: 'Upcoming', value: data.upcomingRevision, icon: CalendarClock, accent: 'text-sky-400 bg-sky-500/10', link: '/revision?queue=upcoming' },
    { label: 'Mastered', value: data.masteredCount, icon: Award, accent: 'text-cyan-300 bg-cyan-400/10', link: '/questions?tab=strong' },
  ];

  return (
    <div className="animate-in space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">
          {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="mt-0.5 text-sm text-slate-400">{formatDate(new Date())}</p>
      </div>

      {/* ---------- Today's Revision (the most important card) ---------- */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-indigo-300">
              <Play size={15} /> Today's Revision
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-extrabold text-slate-50">
                {rev.total}
              </span>
              <span className="text-sm text-slate-400">
                {hasDue ? 'question(s) due' : 'nothing due — queue clear 🎉'}
                {rev.overdue > 0 && (
                  <span className="ml-2 rounded bg-rose-500/15 px-1.5 py-0.5 text-xs font-semibold text-rose-400">
                    {rev.overdue} overdue
                  </span>
                )}
              </span>
            </div>

            <div className="mt-4 max-w-md">
              <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
                <span>
                  {rev.revisedToday} revised today
                </span>
                <span className="font-semibold text-slate-300">{rev.progress}%</span>
              </div>
              <ProgressBar value={rev.progress} barClass="bg-gradient-to-r from-indigo-500 to-cyan-400" />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <button
              onClick={() => navigate(hasDue ? '/revision' : '/revision?queue=upcoming')}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500"
            >
              {hasDue ? 'Continue Revision' : 'Practice Random'}
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => navigate('/revision/session?mode=random&count=5')}
              className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
            >
              Random 5
            </button>
          </div>
        </div>

        {/* Streak strip */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-800 px-5 py-3 text-sm sm:px-6">
          <span className="flex items-center gap-1.5 text-amber-400">
            <Flame size={15} />
            <strong>{data.revisionStreak.current}</strong>
            <span className="text-slate-400">day revision streak</span>
          </span>
          <span className="text-slate-400">
            Longest: <strong className="text-slate-200">{data.revisionStreak.longest}</strong>
          </span>
          <span className="text-slate-400">
            Total days: <strong className="text-slate-200">{data.revisionStreak.totalDays}</strong>
          </span>
          <span className="ml-auto flex items-center gap-4">
            <span className="text-slate-400">
              Solved today: <strong className="text-emerald-400">{data.habit.solved}</strong>
            </span>
            <span className="text-slate-400">
              Revised today: <strong className="text-indigo-300">{data.habit.revised}</strong>
            </span>
          </span>
        </div>
      </Card>

      {/* ---------- Daily task: 3 random questions + weekly % ---------- */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle
            action={
              task && (
                <span className="text-xs font-semibold text-slate-500">
                  {task.completed}/{task.total} done
                </span>
              )
            }
          >
            Today's Task — 3 Random Questions
          </SectionTitle>
          {task ? (
            <div className="space-y-2.5">
              <div className="mb-3">
                <ProgressBar
                  value={Math.round((task.completed / task.total) * 100)}
                  barClass="bg-gradient-to-r from-emerald-500 to-cyan-400"
                />
              </div>
              {task.items.map((item, i) => (
                <div
                  key={item._id}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 transition ${
                    item.done
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      item.done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.done ? <CheckCircle2 size={14} /> : i + 1}
                  </span>
                  <button
                    onClick={() => navigate(`/questions/${item._id}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className={`truncate text-sm font-semibold ${item.done ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                      {item.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <DifficultyBadge difficulty={item.difficulty} />
                      {(item.topics || []).slice(0, 2).map((t) => (
                        <span key={t} className="rounded bg-slate-800/80 px-1.5 py-0.5">{t}</span>
                      ))}
                    </div>
                  </button>
                  {!item.done && (
                    <button
                      onClick={() => navigate(`/questions/${item._id}`)}
                      className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-500"
                    >
                      Solve
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Loading today's task…</p>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle action={<Link to="/habit" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">Details</Link>}>
            This Week
          </SectionTitle>
          {week ? (
            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-slate-50">{week.percent}%</span>
                <span className="text-sm font-semibold text-slate-400">{week.grade}</span>
              </div>
              <ProgressBar
                value={week.percent}
                barClass={week.percent >= 70 ? 'bg-emerald-500' : week.percent >= 50 ? 'bg-amber-400' : 'bg-rose-500'}
              />
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['Revisions', week.totalRevisions, 'text-indigo-300'],
                  ['Solved', week.totalSolved, 'text-emerald-400'],
                  ['Active days', `${week.activeDays}/7`, 'text-amber-400'],
                ].map(([label, value, cls]) => (
                  <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                    <div className={`text-lg font-bold ${cls}`}>{value}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
                  </div>
                ))}
              </div>
              <div className="flex h-16 items-end gap-1.5">
                {week.days.map((d) => {
                  const max = Math.max(1, ...week.days.map((x) => x.revisions + x.solved));
                  const h = ((d.revisions + d.solved) / max) * 100;
                  return (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t ${h > 0 ? 'bg-indigo-500/70' : 'bg-slate-800'}`}
                        style={{ height: `${Math.max(4, h)}%` }}
                        title={`${d.date}: ${d.revisions} revisions, ${d.solved} solved`}
                      />
                      <span className="text-[9px] text-slate-600">{d.date.slice(8)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Loading weekly report…</p>
          )}
        </Card>
      </div>

      {/* ---------- Stat tiles ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.link}>
            <Card className="p-4 transition hover:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{s.label}</span>
                <span className={`rounded-lg p-1.5 ${s.accent}`}>
                  <s.icon size={15} />
                </span>
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-100">{s.value}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ---------- Today's plan ---------- */}
        <Card className="p-5">
          <SectionTitle action={<Lightbulb size={15} className="text-amber-400" />}>Today's Plan</SectionTitle>
          <ol className="space-y-3">
            {data.plan.map((p, i) => {
              const Icon = PLAN_ICONS[p.icon] || Play;
              return (
                <li key={i}>
                  <button
                    onClick={() => navigate(p.link)}
                    className="flex w-full items-start gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-slate-700 hover:bg-slate-800/50"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/15 text-xs font-bold text-indigo-300">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm text-slate-300">{p.text}</span>
                    <Icon size={15} className="mt-0.5 text-slate-500" />
                  </button>
                </li>
              );
            })}
            {data.plan.length === 0 && (
              <li className="rounded-lg border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-slate-500">
                All caught up. Solve something new! 🚀
              </li>
            )}
          </ol>
          <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] text-slate-500">
            Revision always comes before new problems.
          </p>
        </Card>

        {/* ---------- Weak topics ---------- */}
        <Card className="p-5">
          <SectionTitle
            action={
              <Link to="/revision" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
                View all
              </Link>
            }
          >
            Topic Memory
          </SectionTitle>
          <div className="space-y-3">
            {data.weakTopics.slice(0, 5).map((t) => (
              <button
                key={t.name}
                onClick={() => navigate(`/questions?topics=${encodeURIComponent(t.name)}`)}
                className="block w-full text-left"
              >
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-300">{t.name}</span>
                  <span
                    className={`font-semibold ${
                      t.memory < 50 ? 'text-rose-400' : t.memory < 70 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {t.memory}%
                  </span>
                </div>
                <ProgressBar
                  value={t.memory}
                  barClass={t.memory < 50 ? 'bg-rose-500' : t.memory < 70 ? 'bg-amber-400' : 'bg-emerald-500'}
                  className="h-1.5"
                />
              </button>
            ))}
            {data.weakTopics.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">Revise a few questions to see topic memory.</p>
            )}
          </div>
          {data.weakTopics[0] && (
            <div className="mt-4 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs">
              <span className="text-rose-300">Weakest topic:</span>{' '}
              <span className="font-bold text-rose-200">{data.weakTopics[0].name}</span>
            </div>
          )}
        </Card>

        {/* ---------- Recent activity ---------- */}
        <Card className="p-5">
          <SectionTitle
            action={
              <Link to="/habit" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
                Analytics
              </Link>
            }
          >
            Recent Revisions
          </SectionTitle>
          <div className="space-y-2.5">
            {data.recentActivity.map((a) => (
              <div key={a.id} className="flex items-center gap-3 text-sm">
                <ResultBadge result={a.result} />
                <span className="flex-1 truncate text-slate-300">{a.title}</span>
                <span className="shrink-0 text-xs text-slate-500">{relativeTime(a.reviewedAt)}</span>
              </div>
            ))}
            {data.recentActivity.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">
                No revisions yet — your history starts with the first one.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* ---------- Heatmap ---------- */}
      <Card className="p-5">
        <SectionTitle
          action={
            <Link to="/habit" className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300">
              Full habit view <ArrowRight size={12} />
            </Link>
          }
        >
          Revision Heatmap
        </SectionTitle>
        <Heatmap days={heat || []} />
      </Card>

      {/* ---------- Weak questions preview ---------- */}
      {data.weakQuestions.length > 0 && (
        <Card className="p-5">
          <SectionTitle
            action={
              <Link to="/revision" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
                All weak questions
              </Link>
            }
          >
            Needs Attention
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.weakQuestions.slice(0, 6).map((q) => (
              <Link
                key={q._id}
                to={`/questions/${q._id}`}
                className="rounded-lg border border-slate-800 bg-slate-950/40 p-3.5 transition hover:border-slate-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-200">{q.title}</h4>
                  <CategoryBadge strength={q.revision?.memoryStrength} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <DifficultyBadge difficulty={q.difficulty} />
                  {(q.topics || []).slice(0, 2).map((t) => (
                    <TopicChip key={t} topic={t} />
                  ))}
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
                  <span>{q.revision?.revisionCount || 0} revisions</span>
                  <span className={q.revision?.daysUntilReview < 0 ? 'text-rose-400' : ''}>
                    {q.revision?.daysUntilReview <= 0 ? 'due now' : `in ${q.revision?.daysUntilReview}d`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck2, Flame, Target, CheckCircle2, Zap } from 'lucide-react';
import { getHeatmap, getDayDetail, getStreak, getTodayActivity, getAnalytics } from '../services/statsService';
import { getWeeklyPerformance } from '../services/taskService';
import { LoadingState, Spinner } from '../components/common/Loading';
import { ErrorState, InlineError } from '../components/common/States';
import { Card, PageHeader, SectionTitle } from '../components/common/Layout';
import { ProgressBar } from '../components/common/Meters';
import { ResultBadge, DifficultyBadge } from '../components/common/Badges';
import Heatmap from '../components/revision/Heatmap';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatMinutes } from '../utils/dates';

export default function Habit() {
  const { user } = useAuth();
  const [heat, setHeat] = useState(null);
  const [streak, setStreak] = useState(null);
  const [today, setToday] = useState(null);
  const [week, setWeek] = useState(null);
  const [perf, setPerf] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(null); // {date, detail} | {date, loading}
  const [dayBusy, setDayBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, s, t, w, p] = await Promise.all([
        getHeatmap(52),
        getStreak(),
        getTodayActivity(),
        getWeeklyPerformance(),
        getAnalytics(),
      ]);
      setHeat(h);
      setStreak(s);
      setToday(t);
      setWeek(w.performance);
      setPerf(p);
      setError('');
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to load habit data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDay = async (date) => {
    setDay({ date });
    setDayBusy(true);
    try {
      const detail = await getDayDetail(date);
      setDay({ date, detail });
    } catch (err) {
      setDay({ date, error: err.friendlyMessage || 'Failed to load day' });
    } finally {
      setDayBusy(false);
    }
  };

  const goalSolve = user?.preferences?.dailySolveGoal ?? 3;
  const goalRevise = user?.preferences?.dailyRevisionGoal ?? 10;

  const totals = heat?.totals || {};
  const last30 = useMemo(() => {
    if (!heat?.days) return { revisions: 0, solved: 0, active: 0 };
    const d = heat.days.slice(-30);
    const revisions = d.reduce((s, x) => s + x.revisions, 0);
    const solved = d.reduce((s, x) => s + x.solved, 0);
    const active = d.filter((x) => x.revisions > 0 || x.solved > 0).length;
    return { revisions, solved, active };
  }, [heat]);

  if (loading) return <LoadingState label="Loading your habit data…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const streakCls = 'text-amber-400';

  return (
    <div className="animate-in">
      <PageHeader
        title="Habit Tracker"
        subtitle="Solving and revising are tracked separately — revision is the habit that makes the rest stick."
        actions={
          <Link
            to="/settings"
            className="rounded-lg border border-slate-700 px-3.5 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
          >
            Edit goals
          </Link>
        }
      />

      {/* Streak row */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className={`p-4 ${streak?.activeToday ? 'border-amber-500/40' : ''}`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Current streak</span>
            <Flame size={16} className={streakCls} />
          </div>
          <div className={`mt-1.5 text-3xl font-extrabold ${streakCls}`}>
            {streak?.current ?? 0}
            <span className="ml-1 text-sm font-semibold text-slate-500">days</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {streak?.activeToday ? '✓ active today' : 'not active today yet — revise once'}
          </div>
        </Card>
        <StatCard label="Longest streak" value={`${streak?.longest ?? 0}d`} icon={Target} accent="text-orange-400" />
        <StatCard label="Active days" value={streak?.totalDays ?? 0} icon={CalendarCheck2} accent="text-emerald-400" hint="days with revisions ever" />
        <StatCard label="Last 30 days" value={`${last30.revisions}`} icon={Zap} accent="text-indigo-300" hint={`${last30.active} active days · ${last30.solved} solved`} />
      </div>

      {/* ---------- Weekly performance % ---------- */}
      {week && (
        <Card className="mb-5 p-5">
          <SectionTitle action={<span className="text-xs text-slate-500">last 7 days</span>}>
            Weekly Performance
          </SectionTitle>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="shrink-0">
              <div className="text-5xl font-extrabold text-slate-50">{week.percent}%</div>
              <div className={`mt-1 text-sm font-semibold ${
                week.percent >= 70 ? 'text-emerald-400' : week.percent >= 50 ? 'text-amber-400' : 'text-rose-400'
              }`}>
                {week.grade}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <ProgressBar
                value={week.percent}
                barClass={week.percent >= 70 ? 'bg-emerald-500' : week.percent >= 50 ? 'bg-amber-400' : 'bg-rose-500'}
              />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  ['Revisions', week.totalRevisions, `goal ${week.goals.dailyRevisionGoal * 7}`, 'text-indigo-300'],
                  ['Solved', week.totalSolved, `goal ${week.goals.dailySolveGoal * 7}`, 'text-emerald-400'],
                  ['Active days', `${week.activeDays}/7`, 'consistency', 'text-amber-400'],
                ].map(([label, value, sub, cls]) => (
                  <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                    <div className={`text-lg font-bold ${cls}`}>{value}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
                    <div className="text-[10px] text-slate-600">{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* per-day bars */}
          <div className="mt-4 flex h-20 items-end gap-1.5">
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
        </Card>
      )}

      {/* ---------- Lifetime performance ---------- */}
      {perf?.totals && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Solved questions" value={perf.totals.totalQuestions} icon={Target} accent="text-slate-300" hint="marked solved so far" />
          <StatCard label="Total revisions" value={perf.totals.totalRevisions} icon={Zap} accent="text-indigo-300" hint={`${perf.totals.totalRevisionMinutes} min spent`} />
          <StatCard label="Avg recall" value={`${perf.totals.avgRecall}%`} icon={CheckCircle2} accent="text-emerald-400" hint={`${perf.totals.avgInterval}d avg interval`} />
          <StatCard label="Mastered" value={perf.totals.mastered} icon={Target} accent="text-cyan-300" hint="strength ≥ 85%" />
          <StatCard label="Weak / Forgotten" value={`${perf.totals.weak}/${perf.totals.forgotten}`} icon={Flame} accent="text-rose-400" hint="need attention" />
        </div>
      )}

      {/* Memory distribution */}
      {perf?.memoryDistribution?.length > 0 && (
        <Card className="mb-5 p-5">
          <SectionTitle>Memory Distribution</SectionTitle>
          <div className="space-y-2.5">
            {perf.memoryDistribution.map((b) => {
              const total = perf.memoryDistribution.reduce((s, x) => s + x.value, 0) || 1;
              const pct = Math.round((b.value / total) * 100);
              const color =
                b.name === 'Mastered' ? 'bg-cyan-400' :
                b.name === 'Strong' ? 'bg-emerald-500' :
                b.name === 'Learning' ? 'bg-amber-400' :
                b.name === 'Weak' ? 'bg-orange-500' : 'bg-rose-500';
              return (
                <div key={b.name} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs font-medium text-slate-400">{b.name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-12 shrink-0 text-right text-xs font-semibold text-slate-300">{b.value}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Today's goals */}
      <Card className="mb-5 p-5">
        <SectionTitle action={<span className="text-xs text-slate-500">{formatDate(new Date())}</span>}>
          Today's goals
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 size={15} className="text-emerald-400" /> Solved today
              </span>
              <span className="font-bold text-slate-200">
                {today?.solved ?? 0} / {goalSolve}
              </span>
            </div>
            <ProgressBar
              value={today?.solved ?? 0}
              max={goalSolve}
              barClass={goalSolve && (today?.solved ?? 0) >= goalSolve ? 'bg-emerald-400' : 'bg-emerald-600'}
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-300">
                <Flame size={15} className="text-indigo-400" /> Revised today
              </span>
              <span className="font-bold text-slate-200">
                {today?.revised ?? 0} / {goalRevise}
              </span>
            </div>
            <ProgressBar
              value={today?.revised ?? 0}
              max={goalRevise}
              barClass={goalRevise && (today?.revised ?? 0) >= goalRevise ? 'bg-indigo-400' : 'bg-indigo-600'}
            />
          </div>
        </div>
        {(today?.revised ?? 0) < goalRevise && (
          <div className="mt-4 border-t border-slate-800 pt-3 text-sm text-slate-400">
            <Link to="/revision" className="font-semibold text-indigo-400 hover:text-indigo-300">
              {Math.max(0, goalRevise - (today?.revised ?? 0))} more revisions to hit today's goal →
            </Link>
          </div>
        )}
      </Card>

      {/* Heatmap */}
      <Card className="mb-5 p-5">
        <SectionTitle
          action={
            <span className="text-[11px] text-slate-500">
              {totals.days || 0} active days · {totals.revisions || 0} revisions · {totals.solved || 0} solved
            </span>
          }
        >
          Revision heatmap — past 12 months
        </SectionTitle>
        <Heatmap days={heat?.days || []} onSelect={openDay} />
        <p className="mt-3 text-[11px] text-slate-600">Click any day to see what you revised and solved.</p>
      </Card>

      {/* Day drill-down */}
      <Modal
        open={!!day}
        onClose={() => setDay(null)}
        title={day ? formatDate(`${day.date}T00:00:00`) : ''}
        description="Everything that happened on this day"
        size="md"
      >
        {dayBusy || !day?.detail ? (
          <div className="flex justify-center py-8">
            <Spinner size={24} className="text-indigo-400" />
          </div>
        ) : day?.error ? (
          <InlineError message={day.error} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-slate-950/50 p-3">
                <div className="text-xl font-bold text-emerald-400">{day.detail.solvedCount}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">solved</div>
              </div>
              <div className="rounded-lg bg-slate-950/50 p-3">
                <div className="text-xl font-bold text-indigo-300">{day.detail.revisedCount}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">revised</div>
              </div>
              <div className="rounded-lg bg-slate-950/50 p-3">
                <div className="text-xl font-bold text-amber-400">
                  {formatMinutes(Math.round((day.detail.revisions || []).reduce((s, r) => s + (r.secondsSpent || 0), 0) / 60))}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">time</div>
              </div>
            </div>

            {day.detail.revisions?.length ? (
              <ul className="space-y-2">
                {day.detail.revisions.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm">
                    <ResultBadge result={r.result} />
                    <span className="flex-1 truncate text-slate-300">{r.title}</span>
                    <DifficultyBadge difficulty={r.difficulty} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-slate-500">
                No revisions recorded on this day.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent, hint }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon size={16} className={accent} />
      </div>
      <div className={`mt-1.5 text-2xl font-extrabold ${accent}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
    </Card>
  );
}

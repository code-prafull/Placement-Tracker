import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarCheck, CheckCircle2, Circle, Flame, ExternalLink, Shuffle, Trophy, ArrowRight,
} from 'lucide-react';
import { getTodayTask, getWeeklyPerformance } from '../services/taskService';
import { markSolved } from '../services/questionService';
import { getStreak } from '../services/statsService';
import { LoadingState } from '../components/common/Loading';
import { ErrorState } from '../components/common/States';
import { Card, PageHeader, SectionTitle } from '../components/common/Layout';
import { ProgressBar } from '../components/common/Meters';
import { DifficultyBadge } from '../components/common/Badges';
import { greeting, formatDate } from '../utils/dates';

/** LeetCode URL — question ka apna link ho to wahi, warna title se search. */
function leetcodeUrl(item) {
  if (item.externalLink) return item.externalLink;
  return `https://leetcode.com/search/?q=${encodeURIComponent(item.title)}`;
}

/**
 * Daily Practice — aaj ke 3 random question (alag-alag topic ka combination).
 *
 * Flow: LeetCode pe solve karo → wapas aake "✓ Solved" dabao.
 * Backend mark solved + first revision aaj ke liye schedule kar deta hai,
 * toh ye question apne aap "Today's Revision" queue me aa jayega.
 */
export default function DailyPractice() {
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [week, setWeek] = useState(null);
  const [streak, setStreak] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null); // question being marked solved
  const [flash, setFlash] = useState(''); // confirmation banner

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [t, w, s] = await Promise.all([
        getTodayTask(),
        getWeeklyPerformance(),
        getStreak(),
      ]);
      setTask(t.task);
      setWeek(w.performance);
      setStreak(s);
      setError('');
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to load today’s task');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** One-click "solved on LeetCode" → backend schedules today's first revision. */
  const handleSolved = async (item) => {
    if (busyId) return;
    setBusyId(item._id);
    try {
      await markSolved(item._id);
      setFlash(`✓ "${item.title}" saved — first revision aaj ke liye schedule. Ab Today's Revision me milega.`);
      await load(true);
    } catch (err) {
      setFlash(`✗ Save nahi hua: ${err.friendlyMessage || 'error'}`);
    } finally {
      setBusyId(null);
      setTimeout(() => setFlash(''), 5000);
    }
  };

  if (loading) return <LoadingState label="Loading today’s questions…" />;
  if (error) return <ErrorState message={error} onRetry={() => load()} />;

  const pct = Math.round((task.completed / task.total) * 100);
  const allDone = task.completed >= task.total;

  return (
    <div className="animate-in">
      <PageHeader
        title={`${greeting()} — Daily Practice`}
        subtitle={`${formatDate(new Date())} · 3 question, har baar alag topic ka combination. LeetCode pe solve karo, phir yahan ✓ dabao.`}
      />

      {flash && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300">
          {flash}
        </div>
      )}

      {/* ---------- Progress hero ---------- */}
      <Card className="relative mb-5 overflow-hidden">
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-300">
              <CalendarCheck size={15} /> Today's Task
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-extrabold text-slate-50">
                {task.completed}
                <span className="text-2xl text-slate-500">/{task.total}</span>
              </span>
              <span className="text-sm text-slate-400">
                {allDone ? 'done — aaj ka target complete! 🎉' : 'questions solved today'}
              </span>
            </div>
            <div className="mt-3 w-full max-w-sm">
              <ProgressBar
                value={pct}
                barClass={allDone ? 'bg-emerald-500' : 'bg-gradient-to-r from-emerald-500 to-cyan-400'}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              to={allDone ? '/revision' : '/revision'}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500"
            >
              {allDone ? 'Revise now' : 'Revision queue'} <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {/* mini strip: streak + weekly % */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-800 px-5 py-3 text-sm">
          <span className="flex items-center gap-1.5 text-amber-400">
            <Flame size={15} />
            <strong>{streak?.current ?? 0}</strong>
            <span className="text-slate-400">day streak</span>
          </span>
          {week && (
            <span className="text-slate-400">
              This week:{' '}
              <strong className={week.percent >= 70 ? 'text-emerald-400' : week.percent >= 50 ? 'text-amber-400' : 'text-rose-400'}>
                {week.percent}%
              </strong>{' '}
              <span className="text-slate-500">({week.grade})</span>
            </span>
          )}
          <Link to="/habit" className="ml-auto text-xs font-medium text-indigo-400 hover:text-indigo-300">
            Full performance →
          </Link>
        </div>
      </Card>

      {/* ---------- The 3 questions ---------- */}
      <Card className="p-5">
        <SectionTitle
          action={
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Shuffle size={12} /> mixed topics · same set all day
            </span>
          }
        >
          Aaj ke 3 Question
        </SectionTitle>

        <div className="space-y-3">
          {task.items.map((item, i) => (
            <div
              key={item._id}
              className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 transition ${
                item.done
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
              }`}
            >
              {/* click-to-open area (statement + workspace) */}
              <button
                type="button"
                onClick={() => navigate(`/questions/${item._id}`)}
                className="group flex min-w-0 flex-1 items-center gap-4 text-left"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    item.done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {item.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600">#{i + 1}</span>
                    <span
                      className={`truncate text-sm font-semibold ${
                        item.done ? 'text-slate-400 line-through' : 'text-slate-200 group-hover:text-emerald-300'
                      }`}
                    >
                      {item.title}
                    </span>
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <DifficultyBadge difficulty={item.difficulty} />
                    {(item.topics || []).map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[11px] text-slate-400"
                      >
                        {t}
                      </span>
                    ))}
                    {item.status === 'solved' && !item.done && (
                      <span className="text-[11px] font-medium text-indigo-300">· solved — revise it</span>
                    )}
                  </span>
                </span>
              </button>

              {/* actions */}
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={leetcodeUrl(item)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-indigo-400 hover:text-indigo-300"
                  title="LeetCode pe kholo"
                >
                  LeetCode <ExternalLink size={12} />
                </a>

                {item.done ? (
                  <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-400">
                    <Trophy size={13} /> Done
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === item._id}
                    onClick={() => handleSolved(item)}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                    title="LeetCode pe solve kar liya? Ek click me save karo"
                  >
                    <CheckCircle2 size={13} /> {busyId === item._id ? 'Saving…' : '✓ Solved'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] text-slate-500">
          <strong>Flow:</strong> LeetCode ↗ button se question LeetCode pe khul jayega → wahan solve karo →
          wapas aake <strong>✓ Solved</strong> dabao. Backend mark solved + first revision aaj ke liye
          schedule kar dega, toh wo question <Link to="/revision" className="text-indigo-400 hover:underline">Today's Revision</Link> me
          automatically aa jayega. Din bhar wahi 3 question rahenge — list badalti nahi.
        </p>
      </Card>
    </div>
  );
}

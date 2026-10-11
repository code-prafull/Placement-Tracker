import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, CalendarDays, Flame, Settings as SettingsIcon, Target, Zap } from 'lucide-react';
import { getAnalytics } from '../services/statsService';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/common/Loading';
import { ErrorState } from '../components/common/States';
import { Card, PageHeader, SectionTitle } from '../components/common/Layout';
import { ProgressBar } from '../components/common/Meters';
import { formatDate, formatMinutes } from '../utils/dates';

export default function Profile() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .catch((err) => setError(err.friendlyMessage || 'Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  const t = data?.totals;
  const goalRevise = user?.preferences?.dailyRevisionGoal ?? 10;
  const goalSolve = user?.preferences?.dailySolveGoal ?? 3;

  const joined = user?.createdAt ? formatDate(user.createdAt) : '—';

  return (
    <div className="animate-in">
      <PageHeader
        title="Profile"
        subtitle="Your account and lifetime revision stats."
        actions={
          <Link
            to="/settings"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3.5 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
          >
            <SettingsIcon size={15} /> Settings
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Identity */}
        <Card className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-3xl font-extrabold text-white shadow-xl shadow-indigo-500/25">
            {(user?.name || '?').charAt(0).toUpperCase()}
          </div>
          <h2 className="text-lg font-bold text-slate-100">{user?.name}</h2>
          <p className="text-sm text-slate-500">{user?.email}</p>
          <p className="mt-1 text-xs text-slate-600">Member since {joined}</p>

          <div className="mt-5 space-y-3 border-t border-slate-800 pt-4 text-left">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Target size={12} className="text-indigo-400" /> Daily revision goal
                </span>
                <span className="font-semibold text-slate-300">{goalRevise}</span>
              </div>
              <ProgressBar value={0} max={goalRevise} className="h-1.5" />
              <p className="mt-1 text-[10px] text-slate-600">progress resets each local day</p>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Zap size={12} className="text-emerald-400" /> Daily solve goal
                </span>
                <span className="font-semibold text-slate-300">{goalSolve}</span>
              </div>
              <ProgressBar value={0} max={goalSolve} barClass="bg-emerald-500" className="h-1.5" />
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="space-y-5 lg:col-span-2">
          {loading ? (
            <LoadingState label="Loading lifetime stats…" />
          ) : error ? (
            <ErrorState message={error} />
          ) : t ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Solved', value: t.totalQuestions, icon: CalendarDays, accent: 'text-emerald-400' },
                  { label: 'Revisions', value: t.totalRevisions, icon: Zap, accent: 'text-indigo-300' },
                  { label: 'Mastered', value: t.mastered, icon: Award, accent: 'text-cyan-300' },
                  { label: 'Streak', value: `${t.revisionStreak}d`, icon: Flame, accent: 'text-amber-400' },
                ].map((s) => (
                  <Card key={s.label} className="p-4 text-center">
                    <s.icon size={16} className={`mx-auto ${s.accent}`} />
                    <div className={`mt-1.5 text-2xl font-extrabold ${s.accent}`}>{s.value}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
                  </Card>
                ))}
              </div>

              <Card className="p-5">
                <SectionTitle>Lifetime summary</SectionTitle>
                <div className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
                  {[
                    ['Average recall', `${t.avgRecall}%`],
                    ['Active revision days', t.totalRevisionDays],
                    ['Longest streak', `${t.longestStreak} days`],
                    ['Average interval', `${t.avgInterval} days`],
                    ['Time in revision', formatMinutes(t.totalRevisionMinutes)],
                    ['Weak / forgotten', `${t.weak} / ${t.forgotten}`],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between border-b border-slate-800/70 pb-2"
                    >
                      <span className="text-slate-500">{label}</span>
                      <span className="font-semibold text-slate-200">{value}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="flex flex-wrap gap-3 p-5">
                <Link
                  to="/analytics"
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
                >
                  Open analytics
                </Link>
                <Link
                  to="/habit"
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Habit heatmap
                </Link>
                <Link
                  to="/roadmap"
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Roadmap
                </Link>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

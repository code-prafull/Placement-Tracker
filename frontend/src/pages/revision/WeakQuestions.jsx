import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, ShieldAlert, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getWeak } from '../../services/revisionService';
import { LoadingState } from '../../components/common/Loading';
import { ErrorState, EmptyState } from '../../components/common/States';
import { Card, PageHeader, SectionTitle } from '../../components/common/Layout';
import { CategoryBadge, DifficultyBadge, ResultBadge, TopicChip } from '../../components/common/Badges';
import { MemoryMeter } from '../../components/common/Meters';
import { dueLabel, relativeTime } from '../../utils/dates';

function WeaknessReason({ item }) {
  const rev = item.revision || {};
  const flags = rev.weakFlags || [];
  const reasons = [];

  if ((rev.revisionCount || 0) > 0 && (rev.memoryStrength ?? 50) < 45) reasons.push('low memory');
  if (flags.includes('repeated-forgot')) reasons.push('repeated forgot');
  if (flags.includes('recent-forgot')) reasons.push('recent forgot');
  if (flags.includes('low-streak')) reasons.push('no good streak');
  if (flags.includes('long-overdue') || (rev.daysUntilReview ?? 0) < 0) reasons.push('overdue');

  const trend =
    rev.resultStreak >= 3 ? 'up' : rev.lastResult === 'forgot' || rev.lastResult === 'hard' ? 'down' : 'flat';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendCls = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-rose-400' : 'text-slate-500';

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
      <TrendIcon size={12} className={trendCls} />
      {reasons.length ? (
        reasons.map((r) => (
          <span key={r} className="rounded bg-rose-500/10 px-1.5 py-0.5 font-medium text-rose-300">
            {r}
          </span>
        ))
      ) : (
        <span className="rounded bg-slate-700/40 px-1.5 py-0.5 text-slate-400">monitoring</span>
      )}
      {rev.lastResult && <ResultBadge result={rev.lastResult} />}
    </div>
  );
}

export default function WeakQuestions() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getWeak();
      setItems(res.items || []);
      setError('');
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to load weak questions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = (items || []).filter((q) => {
    const s = q.revision?.memoryStrength ?? 50;
    if (filter === 'forgotten') return s < 25;
    if (filter === 'weak') return s >= 25 && s < 45;
    if (filter === 'overdue') return (q.revision?.daysUntilReview ?? 0) < 0;
    return true;
  });

  const weakestTopics = (() => {
    const map = new Map();
    (items || []).forEach((q) => {
      (q.topics || []).forEach((t) => {
        const prev = map.get(t) || { topic: t, n: 0 };
        prev.n += 1;
        map.set(t, prev);
      });
    });
    return [...map.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  })();

  const startAll = () => navigate('/revision/session?mode=deep&count=10');

  if (loading) return <LoadingState label="Finding your weak spots…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="animate-in">
      <PageHeader
        title="Weak Questions"
        subtitle="Questions with low memory strength, repeated forgets or a bad streak. These come first."
        badge={
          <span className="rounded-lg bg-rose-500/15 px-2.5 py-1 text-sm font-bold text-rose-400">
            {items.length}
          </span>
        }
        actions={
          <button
            onClick={startAll}
            disabled={!items.length}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            <Play size={15} /> Revise top 10
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {[
          { key: 'all', label: 'All' },
          { key: 'forgotten', label: 'Forgotten' },
          { key: 'weak', label: 'Weak' },
          { key: 'overdue', label: 'Overdue' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              filter === f.key
                ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
                : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={ShieldAlert}
                title="No weak questions here"
                message="Weak questions show up once your recall ratings dip. Keep revising — the engine will flag them automatically."
                action={
                  <button
                    onClick={() => navigate('/revision')}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    Go to revision queue
                  </button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {visible.map((q) => {
                const rev = q.revision || {};
                const overdue = (rev.daysUntilReview ?? 0) < 0;
                return (
                  <Card key={q._id} className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <Link
                            to={`/questions/${q._id}`}
                            className="text-sm font-semibold text-slate-100 hover:text-indigo-300"
                          >
                            {q.title}
                          </Link>
                          <CategoryBadge strength={rev.memoryStrength} category={rev.category} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <DifficultyBadge difficulty={q.difficulty} />
                          {(q.topics || []).slice(0, 3).map((t) => (
                            <TopicChip key={t} topic={t} />
                          ))}
                          <span className="text-[11px] text-slate-500">
                            {rev.revisionCount || 0} revisions · last {rev.lastReviewedAt ? relativeTime(rev.lastReviewedAt) : 'never'}
                          </span>
                        </div>
                        <WeaknessReason item={q} />
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2 sm:w-44">
                        <MemoryMeter strength={rev.memoryStrength} category={rev.category} compact />
                        <span className={`text-[11px] ${overdue ? 'font-bold text-rose-400' : 'text-slate-500'}`}>
                          {dueLabel(rev.daysUntilReview, rev.nextReviewDate)}
                        </span>
                        <button
                          onClick={() =>
                            navigate(`/revision/session?mode=deep&count=1&start=${q._id}`)
                          }
                          className="w-full rounded-lg bg-indigo-600/90 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500"
                        >
                          <Play size={12} className="mr-1.5 inline" />
                          Revise now
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle>Weak Topics</SectionTitle>
            {weakestTopics.length ? (
              <ul className="space-y-2.5">
                {weakestTopics.map((t) => (
                  <li key={t.topic}>
                    <Link
                      to={`/questions?topics=${encodeURIComponent(t.topic)}`}
                      className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm transition hover:border-slate-700"
                    >
                      <span className="text-slate-300">{t.topic}</span>
                      <span className="text-xs font-semibold text-rose-400">{t.n} weak</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No weak topics detected.</p>
            )}
          </Card>

          <Card className="border-amber-500/25 bg-amber-500/5 p-5">
            <SectionTitle>Why a question appears here</SectionTitle>
            <ul className="space-y-2 text-xs leading-relaxed text-slate-400">
              <li>• Memory strength below 45 (computed, never set manually)</li>
              <li>• You rated it “Forgot” in a recent revision</li>
              <li>• No Good/Easy streak — the retention is breaking</li>
              <li>• Repeated “Forgot” results across sessions</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

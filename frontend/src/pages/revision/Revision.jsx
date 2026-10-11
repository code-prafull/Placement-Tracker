import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Play, CalendarDays, Flame, Clock, History, ShieldAlert, Trash2, Zap, Shuffle, Layers,
} from 'lucide-react';
import { getQueue, getCounts as getQueueCounts } from '../../services/revisionService';
import { LoadingState } from '../../components/common/Loading';
import { ErrorState, EmptyState } from '../../components/common/States';
import { Card, PageHeader } from '../../components/common/Layout';
import { CategoryBadge, DifficultyBadge, TopicChip, ResultBadge } from '../../components/common/Badges';
import { MemoryMeter } from '../../components/common/Meters';
import { dueLabel, relativeTime, formatDate } from '../../utils/dates';
import { QUEUE_TABS } from '../../utils/constants';

const TAB_ICONS = {
  due: CalendarDays,
  overdue: Flame,
  upcoming: Clock,
  recent: History,
  difficult: ShieldAlert,
  forgotten: Trash2,
};

const TAB_EMPTY = {
  due: { title: 'Nothing due today', message: 'Enjoy the margin — or run a random session to stay sharp.' },
  overdue: { title: 'No overdue questions', message: 'Every scheduled revision has been completed on time.' },
  upcoming: { title: 'No upcoming revisions', message: 'Solve and mark questions as solved to schedule their first revision.' },
  recent: { title: 'No recent revisions', message: 'Complete a revision and it will show up here for 7 days.' },
  difficult: { title: 'No difficult questions', message: 'Questions appear here when memory is low or results turn bad.' },
  forgotten: { title: 'Nothing forgotten', message: 'Questions you rate “Forgot” land here.' },
};

function RevisionCard({ item, onStart }) {
  const navigate = useNavigate();
  const rev = item.revision || {};
  const overdue = (rev.daysUntilReview ?? 0) < 0;

  return (
    <Card className="flex flex-col p-4 transition hover:border-slate-700/80">
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={() => navigate(`/questions/${item._id}`)}
          className="text-left"
        >
          <h3 className="text-sm font-semibold text-slate-100 hover:text-indigo-300">{item.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <DifficultyBadge difficulty={item.difficulty} />
            {(item.topics || []).slice(0, 3).map((t) => (
              <TopicChip key={t} topic={t} />
            ))}
          </div>
        </button>
        <CategoryBadge strength={rev.memoryStrength} category={rev.category} />
      </div>

      <div className="mt-3">
        <MemoryMeter strength={rev.memoryStrength} category={rev.category} compact />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>
          Last: <span className="text-slate-300">{rev.lastReviewedAt ? relativeTime(rev.lastReviewedAt) : 'never'}</span>
        </span>
        <span className={overdue ? 'font-semibold text-rose-400' : ''}>
          Next: <span className={overdue ? 'text-rose-400' : 'text-slate-300'}>{dueLabel(rev.daysUntilReview, rev.nextReviewDate)}</span>
        </span>
        <span>
          Revisions: <span className="text-slate-300">{rev.revisionCount || 0}</span>
        </span>
        {rev.lastResult && (
          <span className="flex items-center gap-1.5">
            Last result: <ResultBadge result={rev.lastResult} />
          </span>
        )}
      </div>

      <button
        onClick={() => onStart(item._id)}
        className={`mt-4 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition ${
          overdue
            ? 'bg-rose-600/90 text-white hover:bg-rose-500'
            : 'bg-indigo-600 text-white hover:bg-indigo-500'
        }`}
      >
        <Play size={15} />
        Start Revision
      </button>
    </Card>
  );
}

export default function Revision() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = params.get('queue') || 'due';

  const [counts, setCounts] = useState(null);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('quick');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, c] = await Promise.all([getQueue(activeTab), getQueueCounts()]);
      setItems(q.items);
      setCounts(c.counts);
      setError('');
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to load the revision queue');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    load();
  }, [load]);

  const startSingle = (id) => {
    navigate(`/revision/session?mode=quick&count=1&start=${id}`);
  };

  const startSession = () => {
    // The session page builds the queue itself — avoids double-building
    // (which would reshuffle random mode).
    const count = mode === 'random' ? 5 : 20;
    navigate(`/revision/session?mode=${mode}&count=${count}`);
  };

  const dueTotal = counts ? counts.due + counts.overdue : 0;

  const headerBadge = (
    <span className="rounded-lg bg-amber-400/15 px-2.5 py-1 text-sm font-bold text-amber-300">
      {dueTotal} due
    </span>
  );

  return (
    <div className="animate-in">
      <PageHeader
        title="Today's Revision"
        subtitle="Overdue first, weak before strong — the queue is already prioritised for you."
        badge={headerBadge}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-700 bg-slate-900/70 p-0.5">
              {[
                { key: 'quick', label: 'Quick', icon: Zap },
                { key: 'deep', label: 'Deep', icon: Layers },
                { key: 'random', label: 'Random', icon: Shuffle },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    mode === m.key ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <m.icon size={13} />
                  {m.label}
                </button>
              ))}
            </div>
            <button
              onClick={startSession}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500"
            >
              <Play size={15} />
              {mode === 'random' ? 'Start Random 5' : 'Start Session'}
            </button>
          </div>
        }
      />

      {/* Queue tabs */}
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {QUEUE_TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const Icon = TAB_ICONS[tab.key];
          const n = counts ? (counts[tab.key] ?? 0) : null;
          return (
            <button
              key={tab.key}
              onClick={() => setParams({ queue: tab.key })}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
                isActive
                  ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
                  : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <Icon size={14} />
              {tab.label}
              {n !== null && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                    isActive ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <LoadingState label="Loading queue…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items && items.length === 0 ? (
        <Card>
          <EmptyState
            icon={TAB_ICONS[activeTab]}
            title={TAB_EMPTY[activeTab]?.title || 'Queue is empty'}
            message={TAB_EMPTY[activeTab]?.message}
            action={
              <button
                onClick={() => navigate('/revision/session?mode=random&count=5')}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Random revision instead
              </button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              {items.length} question{items.length === 1 ? '' : 's'} · prioritised by overdue days + memory weakness
            </span>
            {activeTab === 'due' && counts?.overdue > 0 && (
              <button onClick={() => setParams({ queue: 'overdue' })} className="text-amber-400 hover:text-amber-300">
                {counts.overdue} overdue hidden →
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <RevisionCard key={item._id} item={item} onStart={startSingle} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Map, Play, ListChecks, ShieldAlert, ArrowRight } from 'lucide-react';
import { getTopics, getTopicQuestions } from '../services/statsService';
import { LoadingState, Spinner } from '../components/common/Loading';
import { ErrorState, EmptyState } from '../components/common/States';
import { Card, PageHeader, SectionTitle } from '../components/common/Layout';
import { ProgressBar } from '../components/common/Meters';

const STATUS_META = {
  struggling: { label: 'Needs work', cls: 'text-rose-400 bg-rose-500/15 border-rose-500/30', bar: 'bg-rose-500' },
  learning: { label: 'Learning', cls: 'text-amber-300 bg-amber-400/15 border-amber-400/30', bar: 'bg-amber-400' },
  strong: { label: 'Strong', cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30', bar: 'bg-emerald-500' },
  mastered: { label: 'Mastered', cls: 'text-cyan-300 bg-cyan-400/15 border-cyan-400/30', bar: 'bg-cyan-300' },
  fresh: { label: 'Not revised', cls: 'text-slate-400 bg-slate-500/15 border-slate-500/30', bar: 'bg-slate-500' },
};

function statusOf(t) {
  if (!t.revised || t.memory === null) return 'fresh';
  if (t.memory >= 85) return 'mastered';
  if (t.memory >= 65) return 'strong';
  if (t.memory >= 45) return 'learning';
  return 'struggling';
}

const STATUS_ORDER = ['struggling', 'learning', 'fresh', 'strong', 'mastered'];

/** Short description shown under each sheet phase heading (optional). */
const PHASE_HINT = {
  'Phase 1': 'Fundamentals — maths, arrays, sliding window, binary search',
  'Phase 2': 'Core structures — stack, linked list, trees, heap',
  'Phase 3': 'Patterns — greedy, recursion & backtracking, bits, intervals',
  'Phase 4': 'Advanced — graphs, DP, strings, trie',
};

/** Phase heading order: Phase 1…N by number, ungrouped topics last. */
function phaseOrder(phase) {
  const m = String(phase || '').match(/\d+/);
  return m ? Number(m[0]) : 999;
}

export default function Roadmap() {
  const [topics, setTopics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('status');
  const [reviseTopic, setReviseTopic] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTopics();
      setTopics(res.topics || []);
      setError('');
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to load roadmap');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    if (!topics) return null;
    const byStatus = { struggling: 0, learning: 0, fresh: 0, strong: 0, mastered: 0 };
    let solved = 0;
    let weak = 0;
    let mastered = 0;
    topics.forEach((t) => {
      byStatus[statusOf(t)] += 1;
      solved += t.solved;
      weak += t.weak;
      mastered += t.mastered;
    });
    const weakest = [...topics]
      .filter((t) => t.memory !== null && t.revised > 0)
      .sort((a, b) => a.memory - b.memory)[0];
    return { byStatus, solved, weak, mastered, weakest };
  }, [topics]);

  const sorted = useMemo(() => {
    if (!topics) return [];
    const list = [...topics];
    if (sort === 'status') {
      list.sort((a, b) => {
        const d = STATUS_ORDER.indexOf(statusOf(a)) - STATUS_ORDER.indexOf(statusOf(b));
        if (d !== 0) return d;
        return a.name.localeCompare(b.name);
      });
    } else if (sort === 'memory') {
      list.sort((a, b) => (a.memory ?? 999) - (b.memory ?? 999));
    } else if (sort === 'coverage') {
      list.sort((a, b) => b.solved - a.solved);
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [topics, sort]);

  /** Sorted topics bucketed by sheet phase so the roadmap reads top-to-bottom. */
  const grouped = useMemo(() => {
    // NB: `Map` is shadowed by the lucide icon imported above — use a plain object.
    const byPhase = {};
    for (const t of sorted) {
      const key = t.phase || '';
      if (!byPhase[key]) byPhase[key] = [];
      byPhase[key].push(t);
    }
    return Object.entries(byPhase)
      .map(([phase, list]) => ({
        phase,
        list,
        questions: list.reduce((sum, t) => sum + (t.total || 0), 0),
      }))
      .sort(
        (a, b) => phaseOrder(a.phase) - phaseOrder(b.phase) || a.phase.localeCompare(b.phase)
      );
  }, [sorted]);

  const revise = async (name) => {
    setReviseTopic(name);
    try {
      const res = await getTopicQuestions(name, { memory: 'weak' });
      const items = res.items?.filter((q) => (q.revision?.revisionCount ?? 0) > 0) || [];
      const fallback = res.items || [];
      const list = items.length ? items : fallback;
      if (!list.length) {
        navigate(`/questions?topics=${encodeURIComponent(name)}`);
        return;
      }
      const first = list[0]._id;
      navigate(`/revision/session?mode=deep&count=${Math.min(10, list.length)}&start=${first}`);
    } catch {
      navigate(`/questions?topics=${encodeURIComponent(name)}`);
    } finally {
      setReviseTopic('');
    }
  };

  if (loading) return <LoadingState label="Building your roadmap…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="animate-in">
      <PageHeader
        title="DSA Topics"
        subtitle="Har topic ka memory score — jo laal hai pehle usse theek karo."
        actions={
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto min-w-[160px]">
            <option value="status">Sort: by status</option>
            <option value="memory">Sort: weakest memory</option>
            <option value="coverage">Sort: most questions</option>
            <option value="alpha">Sort: A→Z</option>
          </select>
        }
      />

      {topics.length === 0 ? (
        <Card>
          <EmptyState
            icon={Map}
            title="No topics yet"
            message="Add questions with topics and mark them solved — the roadmap grades each topic automatically."
            action={
              <Link
                to="/questions/new"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Add your first question
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Topics covered', value: topics.length, accent: 'text-indigo-300' },
              { label: 'Strong or mastered', value: stats.byStatus.strong + stats.byStatus.mastered, accent: 'text-emerald-400' },
              { label: 'Learning', value: stats.byStatus.learning, accent: 'text-amber-300' },
              { label: 'Needs work', value: stats.byStatus.struggling, accent: 'text-rose-400' },
            ].map((s) => (
              <Card key={s.label} className="p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{s.label}</div>
                <div className={`mt-1.5 text-2xl font-bold ${s.accent}`}>{s.value}</div>
              </Card>
            ))}
          </div>

          {stats.weakest && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm">
              <ShieldAlert size={16} className="text-rose-400" />
              <span className="text-slate-300">
                Weakest topic:{' '}
                <strong className="text-rose-300">{stats.weakest.name}</strong> at{' '}
                {stats.weakest.memory}% memory across {stats.weakest.revised} revised questions.
              </span>
              <button
                onClick={() => revise(stats.weakest.name)}
                className="ml-auto rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/30"
              >
                Fix it now
              </button>
            </div>
          )}

          {grouped.map((g) => (
          <div key={g.phase || 'other'} className="mb-8 last:mb-0">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-800 pb-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-300">
                {g.phase || 'Ungrouped'}
              </h2>
              <span className="text-xs text-slate-500">
                {g.list.length} topic{g.list.length === 1 ? '' : 's'} · {g.questions} questions
              </span>
              {PHASE_HINT[g.phase] && (
                <span className="hidden text-xs text-slate-600 sm:inline">{PHASE_HINT[g.phase]}</span>
              )}
            </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {g.list.map((t) => {
              const status = statusOf(t);
              const meta = STATUS_META[status];
              const coverage = t.solved > 0 ? Math.round((t.mastered / t.solved) * 100) : 0;
              return (
                <Card key={t.name} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/questions?topics=${encodeURIComponent(t.name)}`}
                      className="text-sm font-bold text-slate-100 hover:text-indigo-300"
                    >
                      {t.name}
                    </Link>
                    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{t.solved}/{t.total || 0} solved</span>
                      <span className="font-semibold text-slate-400">
                        {t.solved > 0 ? `${coverage}% mastered` : 'not started'}
                      </span>
                    </div>
                    <ProgressBar
                      value={t.memory ?? 0}
                      barClass={meta.bar}
                      className="h-1.5"
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-slate-950/50 py-1.5">
                      <div className="font-bold text-slate-200">{t.solved}</div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">solved</div>
                    </div>
                    <div className="rounded-lg bg-slate-950/50 py-1.5">
                      <div className="font-bold text-amber-300">{t.weak}</div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">weak</div>
                    </div>
                    <div className="rounded-lg bg-slate-950/50 py-1.5">
                      <div className={`font-bold ${t.memory === null ? 'text-slate-600' : 'text-indigo-300'}`}>
                        {t.memory === null ? '—' : `${t.memory}%`}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">memory</div>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
                    <button
                      onClick={() => navigate(`/questions?topics=${encodeURIComponent(t.name)}`)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
                    >
                      <ListChecks size={13} /> Questions
                    </button>
                    <button
                      onClick={() => revise(t.name)}
                      disabled={reviseTopic === t.name}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600/90 px-2 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {reviseTopic === t.name ? <Spinner size={12} /> : <Play size={13} />}
                      Revise
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
          </div>
          ))}

          {/* Coverage note */}
          <Card className="mt-6 p-5">
            <SectionTitle>How topics are graded</SectionTitle>
            <div className="grid gap-3 text-xs leading-relaxed text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
              <p><strong className="text-rose-400">Needs work</strong> — average memory below 45 or repeated forgets.</p>
              <p><strong className="text-amber-300">Learning</strong> — memory 45–64, intervals still short.</p>
              <p><strong className="text-emerald-400">Strong</strong> — memory 65–84, holding multi-week intervals.</p>
              <p><strong className="text-cyan-300">Mastered</strong> — memory 85+, mostly Easy/Good results.</p>
            </div>
            <Link
              to="/revision"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
            >
              Jump to weak questions <ArrowRight size={12} />
            </Link>
          </Card>
        </>
      )}
    </div>
  );
}

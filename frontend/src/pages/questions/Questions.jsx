import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, Plus, Upload, Trash2, CheckCircle2, Filter, X, ChevronLeft, ChevronRight,
  Play, Pencil, ListFilter, Layers,
} from 'lucide-react';
import { listQuestions, getFacets, bulkAction, deleteQuestion } from '../../services/questionService';
import { LoadingState, Spinner, SkeletonRows } from '../../components/common/Loading';
import { ErrorState, EmptyState, InlineError } from '../../components/common/States';
import { Card, PageHeader } from '../../components/common/Layout';
import { DifficultyBadge, CategoryBadge, StatusBadge, TopicChip } from '../../components/common/Badges';
import { ConfirmDialog, Modal } from '../../components/common/Modal';
import { useQueue } from '../../context/QueueContext';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'solved', label: 'Solved' },
  { key: 'solving', label: 'Solving' },
  { key: 'todo', label: 'To Do' },
  { key: 'due', label: 'Due' },
  { key: 'weak', label: 'Weak' },
  { key: 'strong', label: 'Strong' },
  { key: 'mastered', label: 'Mastered' },
  { key: 'recent', label: 'Recent' },
];

const SORTS = [
  { key: 'nextReview', label: 'Next review' },
  { key: 'newest', label: 'Newest added' },
  { key: 'oldest', label: 'Oldest added' },
  { key: 'memory', label: 'Memory (high→low)' },
  { key: 'lastReviewed', label: 'Last revised' },
  { key: 'title', label: 'Title A→Z' },
  { key: 'difficulty', label: 'Difficulty' },
];

function buildQueryParams(params) {
  const out = { page: params.get('page') || 1, limit: 25, sort: params.get('sort') || 'nextReview' };
  const tab = params.get('tab') || 'all';

  if (params.get('search')) out.search = params.get('search');
  if (params.get('difficulty')) out.difficulty = params.get('difficulty');
  if (params.get('topics')) out.topics = params.get('topics');
  if (params.get('platform')) out.platform = params.get('platform');
  if (params.get('status')) out.status = params.get('status');
  if (params.get('lastRevised')) out.lastRevised = params.get('lastRevised');

  if (tab === 'solved') out.tab = 'solved';
  else if (tab === 'solving') out.status = 'solving';
  else if (tab === 'todo') out.status = 'todo';
  else if (tab === 'due') out.revisionStatus = 'due';
  else if (tab === 'weak') out.memory = 'weak';
  else if (tab === 'strong') out.memory = 'strong';
  else if (tab === 'mastered') out.memory = 'mastered';
  else if (tab === 'recent') out.revisionStatus = 'recent';
  return out;
}

export default function Questions() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh: refreshCounts } = useQueue();

  const [data, setData] = useState(null);
  const [facets, setFacets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // {kind:'delete'|'bulkDelete', ids}
  const [bulkTopicOpen, setBulkTopicOpen] = useState(false);
  const [bulkTopic, setBulkTopic] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const tab = params.get('tab') || 'all';
  const search = params.get('search') || '';
  const [searchInput, setSearchInput] = useState(search);
  const firstRender = useRef(true);

  /* -------- URL → state sync ---------------------------------------------- */
  const setParam = useCallback(
    (patch) => {
      const next = new URLSearchParams(params);
      Object.entries(patch).forEach(([k, v]) => {
        if (v === '' || v === null || v === undefined) next.delete(k);
        else next.set(k, v);
      });
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  // Debounced search
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return undefined;
    }
    const t = setTimeout(() => {
      setParam({ search: searchInput.trim(), page: 1 });
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  /* -------- data ----------------------------------------------------------- */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listQuestions(buildQueryParams(params));
      setData(res);
      setSelected(new Set());
      setError('');
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getFacets()
      .then((res) => setFacets(res.facets || res))
      .catch(() => setFacets(null));
  }, []);

  /* -------- selection ------------------------------------------------------ */
  const ids = data?.items?.map((i) => i._id) || [];
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(ids));
  };
  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* -------- bulk + row actions --------------------------------------------- */
  const runBulk = async (action, payload = {}) => {
    if (!selected.size) return;
    setBusy(true);
    try {
      await bulkAction(action, [...selected], payload);
      await load();
      refreshCounts();
      setSelected(new Set());
      setBulkTopicOpen(false);
      setBulkTopic('');
    } catch (err) {
      setError(err.friendlyMessage || 'Bulk action failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'bulkDelete') {
        await bulkAction('delete', confirm.ids);
      } else {
        await deleteQuestion(confirm.id);
      }
      await load();
      refreshCounts();
      setSelected(new Set());
      setConfirm(null);
    } catch (err) {
      setError(err.friendlyMessage || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const activeFilters = ['difficulty', 'topics', 'platform', 'status', 'lastRevised'].filter((k) => params.get(k));

  /* -------- derived -------------------------------------------------------- */
  const pagination = data?.pagination;
  const items = data?.items || [];

  const pageNumbers = useMemo(() => {
    if (!pagination) return [];
    const { page, totalPages } = pagination;
    const out = [];
    const from = Math.max(1, page - 2);
    const to = Math.min(totalPages, page + 2);
    for (let i = from; i <= to; i++) out.push(i);
    return out;
  }, [pagination]);

  /* ============================ render ==================================== */

  return (
    <div className="animate-in">
      <PageHeader
        title="My Questions"
        subtitle={
          data ? `${pagination.total} question${pagination.total === 1 ? '' : 's'} in your bank` : 'Your DSA question bank'
        }
        actions={
          <div className="flex gap-2">
            <Link
              to="/questions/import"
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
            >
              <Upload size={15} /> <span className="hidden sm:inline">Import</span>
            </Link>
            <Link
              to="/questions/new"
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-indigo-500"
            >
              <Plus size={15} /> Add Question
            </Link>
          </div>
        }
      />

      {/* Tabs */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParam({ tab: t.key === 'all' ? '' : t.key, page: 1 })}
            className={`shrink-0 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
              tab === t.key
                ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
                : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search title, topics, companies, notes…"
              className="w-full pl-9"
              aria-label="Search questions"
            />
          </div>
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
              activeFilters.length
                ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Filter size={15} />
            <span className="hidden sm:inline">Filters</span>
            {activeFilters.length > 0 && (
              <span className="rounded bg-indigo-500 px-1.5 text-[11px] font-bold text-white">{activeFilters.length}</span>
            )}
          </button>
          <select
            value={params.get('sort') || 'nextReview'}
            onChange={(e) => setParam({ sort: e.target.value, page: 1 })}
            className="w-auto min-w-[150px]"
            aria-label="Sort"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </div>

        {filtersOpen && (
          <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Difficulty</label>
              <select
                value={params.get('difficulty') || ''}
                onChange={(e) => setParam({ difficulty: e.target.value, page: 1 })}
                className="w-full text-sm"
              >
                <option value="">Any</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Topic</label>
              <select
                value={params.get('topics') || ''}
                onChange={(e) => setParam({ topics: e.target.value, page: 1 })}
                className="w-full text-sm"
              >
                <option value="">Any</option>
                {(facets?.topics || []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Platform</label>
              <select
                value={params.get('platform') || ''}
                onChange={(e) => setParam({ platform: e.target.value, page: 1 })}
                className="w-full text-sm"
              >
                <option value="">Any</option>
                {(facets?.platforms || []).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
              <select
                value={params.get('status') || ''}
                onChange={(e) => setParam({ status: e.target.value, page: 1 })}
                className="w-full text-sm"
              >
                <option value="">Any</option>
                <option value="solved">Solved</option>
                <option value="solving">Solving</option>
                <option value="todo">To do</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Last revised</label>
              <select
                value={params.get('lastRevised') || ''}
                onChange={(e) => setParam({ lastRevised: e.target.value, page: 1 })}
                className="w-full text-sm"
              >
                <option value="">Any time</option>
                <option value="7">Past week</option>
                <option value="30">Past month</option>
                <option value="never">Never</option>
              </select>
            </div>
            {activeFilters.length > 0 && (
              <div className="sm:col-span-2 lg:col-span-5">
                <button
                  onClick={() => setParam({ difficulty: '', topics: '', platform: '', status: '', lastRevised: '', page: 1 })}
                  className="flex items-center gap-1 text-xs font-medium text-rose-400 hover:text-rose-300"
                >
                  <X size={12} /> Clear all filters
                </button>
              </div>
            )}
          </Card>
        )}
      </div>

      {error && <div className="mb-4"><InlineError message={error} /></div>}

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-3">
          <span className="text-sm font-semibold text-indigo-200">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              onClick={() => runBulk('markSolved')}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600/90 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <CheckCircle2 size={13} /> Mark solved
            </button>
            <button
              onClick={() => setBulkTopicOpen(true)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              <Layers size={13} /> Add topic
            </button>
            <select
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) runBulk('changeDifficulty', { difficulty: e.target.value });
                e.target.value = '';
              }}
              className="w-auto py-1.5 text-xs"
              defaultValue=""
            >
              <option value="" disabled>
                Set difficulty…
              </option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
            <button
              onClick={() => setConfirm({ kind: 'bulkDelete', ids: [...selected] })}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600/90 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              <Trash2 size={13} /> Delete
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Card className="p-4">
          <SkeletonRows rows={6} />
        </Card>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListFilter}
            title={search || activeFilters.length ? 'No questions match' : 'Your bank is empty'}
            message={
              search || activeFilters.length
                ? 'Try a different search or clear the filters.'
                : 'Add your first question manually or import a CSV/JSON export.'
            }
            action={
              search || activeFilters.length ? (
                <button
                  onClick={() => {
                    setSearchInput('');
                    setParam({ search: '', difficulty: '', topics: '', platform: '', status: '', lastRevised: '', tab: '', page: 1 });
                  }}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Reset search & filters
                </button>
              ) : (
                <div className="flex gap-2">
                  <Link
                    to="/questions/new"
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    Add question
                  </Link>
                  <Link
                    to="/questions/import"
                    className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
                  >
                    Import CSV/JSON
                  </Link>
                </div>
              )
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th className="px-2 py-3">Question</th>
                  <th className="hidden px-2 py-3 md:table-cell">Difficulty</th>
                  <th className="hidden px-2 py-3 lg:table-cell">Topics</th>
                  <th className="hidden px-2 py-3 sm:table-cell">Status</th>
                  <th className="px-2 py-3">Memory</th>
                  <th className="hidden px-2 py-3 lg:table-cell">Next review</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((q) => {
                  const rev = q.revision || {};
                  const dueNow = (rev.daysUntilReview ?? 0) <= 0 && q.status === 'solved';
                  return (
                    <tr
                      key={q._id}
                      className={`group border-b border-slate-800/60 transition last:border-0 hover:bg-slate-800/30 ${
                        selected.has(q._id) ? 'bg-indigo-500/5' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(q._id)}
                          onChange={() => toggleOne(q._id)}
                          aria-label={`Select ${q.title}`}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <Link
                          to={`/questions/${q._id}`}
                          className="font-medium text-slate-200 hover:text-indigo-300"
                        >
                          {q.title}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                          <span>{q.platform}</span>
                          {q.companies?.length > 0 && <span>· {q.companies.slice(0, 2).join(', ')}</span>}
                        </div>
                      </td>
                      <td className="hidden px-2 py-3 md:table-cell">
                        <DifficultyBadge difficulty={q.difficulty} />
                      </td>
                      <td className="hidden max-w-[220px] px-2 py-3 lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(q.topics || []).slice(0, 2).map((t) => (
                            <TopicChip key={t} topic={t} />
                          ))}
                          {(q.topics || []).length > 2 && (
                            <span className="text-[11px] text-slate-500">+{q.topics.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="hidden px-2 py-3 sm:table-cell">
                        <StatusBadge status={q.status} />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className={`h-full rounded-full ${
                                (rev.memoryStrength ?? 50) >= 85
                                  ? 'bg-cyan-300'
                                  : (rev.memoryStrength ?? 50) >= 65
                                    ? 'bg-emerald-400'
                                    : (rev.memoryStrength ?? 50) >= 45
                                      ? 'bg-amber-400'
                                      : 'bg-rose-500'
                              }`}
                              style={{ width: `${Math.max(3, rev.memoryStrength ?? 50)}%` }}
                            />
                          </div>
                          <CategoryBadge strength={rev.memoryStrength} category={rev.category} />
                        </div>
                      </td>
                      <td className="hidden px-2 py-3 lg:table-cell">
                        {q.status === 'solved' ? (
                          <span className={`text-xs ${dueNow ? 'font-bold text-amber-400' : 'text-slate-400'}`}>
                            {q.derivedStatus === 'overdue' ? (
                              <span className="text-rose-400">Overdue {Math.abs(rev.daysUntilReview)}d</span>
                            ) : (rev.daysUntilReview ?? 0) === 0 ? (
                              'Today'
                            ) : (rev.daysUntilReview ?? 0) === 1 ? (
                              'Tomorrow'
                            ) : (
                              `in ${rev.daysUntilReview}d`
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-60 transition group-hover:opacity-100">
                          {q.status === 'solved' && (
                            <button
                              onClick={() => navigate(`/revision/session?mode=quick&count=1&start=${q._id}`)}
                              className="rounded p-1.5 text-slate-400 hover:bg-indigo-500/15 hover:text-indigo-300"
                              title="Revise now"
                            >
                              <Play size={14} />
                            </button>
                          )}
                          <Link
                            to={`/questions/${q._id}/edit`}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </Link>
                          <button
                            onClick={() => setConfirm({ kind: 'delete', id: q._id, title: q.title })}
                            className="rounded p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-400"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3">
              <span className="text-xs text-slate-500">
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setParam({ page: Math.max(1, pagination.page - 1) })}
                  disabled={pagination.page <= 1}
                  className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={15} />
                </button>
                {pageNumbers.map((n) => (
                  <button
                    key={n}
                    onClick={() => setParam({ page: String(n) })}
                    className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${
                      n === pagination.page
                        ? 'bg-indigo-600 text-white'
                        : 'border border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setParam({ page: String(Math.min(pagination.totalPages, pagination.page + 1)) })}
                  disabled={pagination.page >= pagination.totalPages}
                  className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Modals */}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={confirmDelete}
        title={confirm?.kind === 'bulkDelete' ? `Delete ${confirm.ids.length} questions?` : 'Delete question?'}
        message={
          confirm?.kind === 'bulkDelete'
            ? 'All of these questions AND their revision histories will be permanently deleted. Revision history is immutable — it can only be deleted, never edited.'
            : `“${confirm?.title || ''}” and its full revision history will be permanently deleted. This cannot be undone.`
        }
        confirmLabel="Delete permanently"
        danger
        busy={busy}
      />

      <Modal
        open={bulkTopicOpen}
        onClose={() => setBulkTopicOpen(false)}
        title="Add a topic to selected questions"
        size="sm"
      >
        <input
          type="text"
          value={bulkTopic}
          onChange={(e) => setBulkTopic(e.target.value)}
          placeholder="e.g. Monotonic Stack"
          className="w-full"
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setBulkTopicOpen(false)}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => bulkTopic.trim() && runBulk('addTopic', { topic: bulkTopic.trim() })}
            disabled={busy || !bulkTopic.trim()}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy && <Spinner size={14} />} Add
          </button>
        </div>
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Lightbulb,
  Pencil, Trash2, Building2, CalendarCheck,
} from 'lucide-react';
import { getQuestion, deleteQuestion, markSolved } from '../../services/questionService';
import { useQueue } from '../../context/QueueContext';
import { LoadingState, Spinner } from '../../components/common/Loading';
import { ErrorState, InlineError } from '../../components/common/States';
import { CategoryBadge, DifficultyBadge, ResultBadge, StatusBadge, TopicChip } from '../../components/common/Badges';
import { MemoryMeter } from '../../components/common/Meters';
import { ConfirmDialog } from '../../components/common/Modal';
import { formatDate, relativeTime, dueLabel } from '../../utils/dates';

/* -------------------------------------------------------------------------- */
/* Small presentational pieces                                                 */
/* -------------------------------------------------------------------------- */

function Example({ index, ex }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-semibold text-slate-200 transition hover:bg-slate-800/40"
      >
        {open ? <ChevronDown size={15} className="text-slate-500" /> : <ChevronRight size={15} className="text-slate-500" />}
        Example {index + 1}
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-slate-800 px-4 py-3.5 font-mono text-xs leading-relaxed">
          {ex.input && (
            <div>
              <span className="font-sans font-semibold text-slate-400">Input:</span>
              <pre className="mt-1 whitespace-pre-wrap text-slate-200">{ex.input}</pre>
            </div>
          )}
          {ex.output && (
            <div>
              <span className="font-sans font-semibold text-slate-400">Output:</span>
              <pre className="mt-1 whitespace-pre-wrap text-emerald-300">{ex.output}</pre>
            </div>
          )}
          {ex.explanation && (
            <div>
              <span className="font-sans font-semibold text-slate-400">Explanation:</span>
              <p className="mt-1 font-sans text-sm leading-relaxed text-slate-300">{ex.explanation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="relative">
      <button
        onClick={copy}
        className="absolute right-2 top-2 rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1 text-[11px] font-semibold text-slate-400 transition hover:text-slate-200"
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-[#050810] p-3.5 text-xs leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Timeline({ history }) {
  if (!history.length) {
    return (
      <p className="py-4 text-sm text-slate-500">
        No revisions yet. The first revision is scheduled for the day you mark it solved.
      </p>
    );
  }
  return (
    <ol className="relative space-y-0 border-l border-slate-800 pl-5">
      {history.map((row) => (
        <li key={row._id} className="relative pb-5 last:pb-0">
          <span
            className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-slate-900 ${
              row.result === 'easy'
                ? 'bg-cyan-300'
                : row.result === 'good'
                  ? 'bg-emerald-400'
                  : row.result === 'hard'
                    ? 'bg-orange-400'
                    : 'bg-rose-500'
            }`}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <ResultBadge result={row.result} />
            <span className="text-slate-300">{formatDate(row.reviewedAt)}</span>
            <span className="text-xs text-slate-500">{relativeTime(row.reviewedAt)}</span>
            <span className="ml-auto text-xs text-slate-500">
              interval {row.previousInterval}d → <strong className="text-slate-300">{row.nextInterval}d</strong>
              {typeof row.memoryStrengthAfter === 'number' && (
                <>
                  {' · '}mem <strong className="text-slate-300">{row.memoryStrengthAfter}%</strong>
                </>
              )}
            </span>
          </div>
          {row.recalledApproach && (
            <p className="mt-1.5 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs leading-relaxed text-slate-400">
              “{row.recalledApproach}”
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Question detail — a calm, revision-first page.
 * No code editor here: solve on LeetCode, then mark ✓ Solved so the first
 * revision gets scheduled and the question enters the revision queue.
 */
export default function QuestionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh: refreshCounts } = useQueue();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [tab, setTab] = useState('description');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getQuestion(id);
      setData(res);
      setTab('description');
      setError('');
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to load the question');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Tabs list — derived null-safely BEFORE any early return (Rules of Hooks).
  const tabs = useMemo(() => {
    const mistakes = data?.question?.mistakes || [];
    const historyLen = data?.history?.length || 0;
    const hasCode = Boolean(data?.question?.code);
    return [
      ['description', 'Description'],
      ['approach', 'Approach'],
      ['notes', 'Notes'],
      ...(hasCode ? [['code', 'Code']] : []),
      ['history', `Timeline (${historyLen})`],
      ...(mistakes.length ? [['mistakes', `Mistakes (${mistakes.length})`]] : []),
    ];
  }, [data]);

  if (loading) return <LoadingState label="Loading question…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const q = data.question;
  const history = data.history || [];
  const rev = q.revision || {};
  const isSolved = q.status === 'solved';
  const dueNow = isSolved && (rev.daysUntilReview ?? 1) <= 0;
  const leetcodeUrl = q.externalLink || `https://leetcode.com/search/?q=${encodeURIComponent(q.title)}`;

  /** One-click "solved on LeetCode" — schedules the first revision for today. */
  const markDone = async () => {
    setBusy(true);
    setActionError('');
    try {
      await markSolved(id);
      await load();
      refreshCounts();
    } catch (err) {
      setActionError(err.friendlyMessage || 'Could not mark solved');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    setActionError('');
    try {
      await deleteQuestion(id);
      refreshCounts();
      navigate('/questions');
    } catch (err) {
      setActionError(err.friendlyMessage || 'Delete failed');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* ---------- Header ---------- */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-400 transition hover:text-slate-200"
        >
          <ArrowLeft size={15} /> Back
        </button>
        <h1 className="text-lg font-bold tracking-tight text-slate-100 sm:text-xl">{q.title}</h1>
        <DifficultyBadge difficulty={q.difficulty} />
        <StatusBadge status={q.status} />
        <div className="ml-auto flex items-center gap-2">
          <a
            href={leetcodeUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-indigo-400 hover:text-indigo-300"
          >
            LeetCode <ExternalLink size={12} />
          </a>
          <Link
            to={`/questions/${q._id}/edit`}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
          >
            <Pencil size={13} /> Edit
          </Link>
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg border border-slate-700 p-1.5 text-slate-400 transition hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-400"
            title="Delete question"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {actionError && <div className="mt-2"><InlineError message={actionError} /></div>}

      {/* ---------- Topic chips ---------- */}
      {(q.topics || []).length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {q.topics.map((t) => (
            <Link key={t} to={`/questions?topics=${encodeURIComponent(t)}`}>
              <TopicChip topic={t} />
            </Link>
          ))}
          {q.companies?.length > 0 && (
            <span className="ml-2 flex items-center gap-1 text-xs text-slate-500">
              <Building2 size={12} /> {q.companies.join(' · ')}
            </span>
          )}
        </div>
      )}

      {/* ---------- Primary action ---------- */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isSolved ? (
          <span className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-300">
            <CheckCircle2 size={16} /> Solved
            <span className="font-normal text-emerald-400/80">· {q.solvedDateKey ? formatDate(q.solvedAt || q.solvedDateKey) : ''}</span>
          </span>
        ) : (
          <button
            onClick={markDone}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:opacity-60"
            title="LeetCode pe solve kar liya? Ek click me save karo"
          >
            {busy ? <Spinner size={15} /> : <CheckCircle2 size={16} />} ✓ Solved on LeetCode
          </button>
        )}

        {dueNow && (
          <button
            onClick={() => navigate(`/revision/session?mode=quick&count=1&start=${q._id}`)}
            className="flex items-center gap-2 rounded-xl bg-amber-400/15 px-4 py-2.5 text-sm font-bold text-amber-300 transition hover:bg-amber-400/25"
          >
            <CalendarCheck size={16} /> Due now — revise
          </button>
        )}
      </div>

      {/* ---------- Memory strip ---------- */}
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Memory</span>
          <CategoryBadge strength={rev.memoryStrength} category={rev.category} />
        </div>
        <MemoryMeter strength={rev.memoryStrength} category={rev.category} />
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
          <span className="text-slate-500">Next review</span>
          <span className="font-medium text-slate-200">
            {isSolved ? dueLabel(rev.daysUntilReview, rev.nextReviewDate) : 'not scheduled'}
          </span>
          <span className="text-slate-500">Revisions</span>
          <span className="font-medium text-slate-200">{rev.revisionCount || 0}</span>
          <span className="text-slate-500">Interval</span>
          <span className="font-medium text-slate-200">{rev.interval || 0} days</span>
          <span className="text-slate-500">Last result</span>
          <span className="font-medium text-slate-200">
            {rev.lastResult ? <ResultBadge result={rev.lastResult} /> : '—'}
          </span>
        </div>
      </div>

      {/* ---------- Tabs ---------- */}
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-800">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-xs font-semibold transition ${
              tab === key
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4 pb-10">
        {tab === 'description' && (
          <>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {q.description || 'No statement saved yet — Edit to add one.'}
            </p>

            {(q.examples || []).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-100">Examples</h3>
                {q.examples.map((ex, i) => (
                  <Example key={i} index={i} ex={ex} />
                ))}
              </div>
            )}

            {(q.constraints || []).length > 0 && (
              <div>
                <h3 className="mb-1.5 text-sm font-bold text-slate-100">Constraints</h3>
                <ul className="space-y-1 text-sm text-slate-300">
                  {q.constraints.map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-slate-600">•</span>
                      <span className="font-mono text-xs leading-relaxed">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(q.hints || []).length > 0 && (
              <div>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-slate-100">
                  <Lightbulb size={14} className="text-amber-400" /> Hints
                </h3>
                <ul className="space-y-1 text-sm text-slate-300">
                  {q.hints.map((h, i) => (
                    <li key={i}>{i + 1}. {h}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {tab === 'approach' && (
          q.approach ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{q.approach}</p>
          ) : (
            <p className="text-sm text-slate-500">No approach written yet — Edit to add one.</p>
          )
        )}

        {tab === 'notes' && (
          q.notes ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{q.notes}</p>
          ) : (
            <p className="text-sm text-slate-500">No notes yet — Edit to add some.</p>
          )
        )}

        {tab === 'code' && q.code && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Stored code{q.language ? ` · ${q.language}` : ''}
              </span>
              {(q.timeComplexity || q.spaceComplexity) && (
                <span className="text-[11px] text-slate-500">
                  {q.timeComplexity && <>Time {q.timeComplexity}</>}
                  {q.timeComplexity && q.spaceComplexity && ' · '}
                  {q.spaceComplexity && <>Space {q.spaceComplexity}</>}
                </span>
              )}
            </div>
            <CodeBlock code={q.code} />
          </div>
        )}

        {tab === 'history' && <Timeline history={history} />}

        {tab === 'mistakes' && (
          <ul className="space-y-2.5">
            {(q.mistakes || []).map((m, i) => (
              <li key={i} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3.5 text-sm">
                <div className="mb-1 flex items-center gap-2">
                  {m.result && <ResultBadge result={m.result} />}
                  <span className="text-xs text-slate-500">{m.reviewedAt ? formatDate(m.reviewedAt) : ''}</span>
                </div>
                <div className="space-y-1 text-slate-300">
                  {m.forgotWhat && <p><span className="text-rose-400">Forgot:</span> {m.forgotWhat}</p>}
                  {m.gotStuck && <p><span className="text-amber-400">Stuck:</span> {m.gotStuck}</p>}
                  {m.mistake && <p><span className="text-orange-400">Mistake:</span> {m.mistake}</p>}
                  {m.insight && <p><span className="text-emerald-400">Insight:</span> {m.insight}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        title="Delete this question?"
        message={`“${q.title}” and its entire revision history (${history.length} rows) will be permanently deleted. Revision history cannot be edited — only removed with the question.`}
        confirmLabel="Delete permanently"
        danger
        busy={busy}
      />
    </div>
  );
}

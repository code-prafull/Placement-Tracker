import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Lightbulb, RefreshCw,
  ShieldAlert, SkipForward, Timer, Trophy, Zap,
} from 'lucide-react';
import { buildSession, startRevision, completeRevision, getHistory } from '../../services/revisionService';
import { getQuestion } from '../../services/questionService';
import { useQueue } from '../../context/QueueContext';
import { LoadingState, Spinner } from '../../components/common/Loading';
import { ErrorState, EmptyState, InlineError } from '../../components/common/States';
import { Card } from '../../components/common/Layout';
import { CategoryBadge, DifficultyBadge, ResultBadge, TopicChip, StatusBadge } from '../../components/common/Badges';
import { ProgressBar } from '../../components/common/Meters';
import { RESULT_META, MEMORY_META } from '../../utils/constants';
import { relativeTime, formatDate } from '../../utils/dates';

const RATINGS = ['forgot', 'hard', 'good', 'easy'];

const RATING_HINTS = {
  forgot: 'Could not recall the approach',
  hard: 'Remembered with significant struggle',
  good: 'Recalled the approach cleanly',
  easy: 'Instant and effortless recall',
};

const RATING_EFFECTS = {
  forgot: 'next review tomorrow',
  hard: 'interval shrinks to ~2 days',
  good: 'interval doubles',
  easy: 'long interval, 14–30 days',
};

/* -------------------------------------------------------------------------- */
/* Rating buttons                                                             */
/* -------------------------------------------------------------------------- */

function RatingPicker({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {RATINGS.map((r) => {
        const meta = RESULT_META[r];
        const active = value === r;
        return (
          <button
            key={r}
            type="button"
            disabled={disabled}
            onClick={() => onChange(r)}
            className={`rounded-xl border px-3 py-3 text-left transition disabled:opacity-50 ${
              active
                ? `${meta.color} ring-1 ring-current`
                : 'border-slate-700/70 bg-slate-950/40 text-slate-300 hover:border-slate-600'
            }`}
          >
            <div className="text-sm font-bold">{meta.label}</div>
            <div className={`mt-0.5 text-[11px] leading-snug ${active ? 'opacity-90' : 'text-slate-500'}`}>
              {RATING_HINTS[r]}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mistake capture                                                            */
/* -------------------------------------------------------------------------- */

function MistakeForm({ value, onChange }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="space-y-3 rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
        <ShieldAlert size={15} /> Capture the mistake
      </p>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">What did I forget? (concept / pattern)</label>
        <input
          type="text"
          value={value.forgotWhat}
          onChange={set('forgotWhat')}
          placeholder="e.g. the two-pointer invariant"
          className="w-full text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Where did I get stuck?</label>
        <input
          type="text"
          value={value.gotStuck}
          onChange={set('gotStuck')}
          placeholder="e.g. choosing between BFS and DFS"
          className="w-full text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">The actual mistake</label>
        <input
          type="text"
          value={value.mistake}
          onChange={set('mistake')}
          placeholder="e.g. off-by-one in the base case"
          className="w-full text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Insight for next time</label>
        <input
          type="text"
          value={value.insight}
          onChange={set('insight')}
          placeholder="e.g. draw the state table first"
          className="w-full text-sm"
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Code block                                                                 */
/* -------------------------------------------------------------------------- */

function CodeBlock({ code, language }) {
  if (!code) return null;
  return (
    <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-[#050810] p-4 text-xs leading-relaxed text-slate-300">
      <code>{code}</code>
    </pre>
  );
}

/* -------------------------------------------------------------------------- */
/* Main session                                                               */
/* -------------------------------------------------------------------------- */

export default function RevisionSession() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh: refreshCounts } = useQueue();

  const mode = params.get('mode') || 'quick';
  const isDeep = mode === 'deep';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  // per-question state
  const [step, setStep] = useState('recall'); // recall | solution | rated
  const [approach, setApproach] = useState('');
  const [showProblem, setShowProblem] = useState(!isDeep);
  const [rating, setRating] = useState(null);
  const [showMistake, setShowMistake] = useState(false);
  const [mistake, setMistake] = useState({ forgotWhat: '', gotStuck: '', mistake: '', insight: '' });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [history, setHistory] = useState([]);

  const startTimes = useRef({});
  const sessionStart = useRef(Date.now());
  const ratedLog = useRef([]); // {id, result, memoryBefore, memoryAfter}
  const approachRef = useRef(null);

  const active = items[index];

  /* -------- build the session once ---------------------------------------- */
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const count = Number(params.get('count')) || (mode === 'random' ? 5 : 20);
      const res = await buildSession({ mode, count });
      let list = res.items || [];

      const startId = params.get('start');
      if (startId) {
        if (list.some((q) => q._id === startId)) {
          list = [list.find((q) => q._id === startId), ...list.filter((q) => q._id !== startId)];
        } else {
          // Not part of the built session — load it directly so a single
          // "Start Revision" click always works.
          const detail = await getQuestion(startId);
          const q = detail.question || detail;
          if (q?._id) list = [q, ...list.filter((x) => x._id !== startId)];
        }
      }

      if (!list.length) {
        setItems([]);
        setLoading(false);
        return;
      }
      setItems(list);
      sessionStart.current = Date.now();
    } catch (err) {
      setError(err.friendlyMessage || 'Could not build a revision session');
    } finally {
      setLoading(false);
    }
  }, [mode, params]);

  useEffect(() => {
    load();
  }, [load]);

  /* -------- mark in_progress whenever a question becomes active ------------ */
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setStep('recall');
    setApproach('');
    setRating(null);
    setShowMistake(false);
    setMistake({ forgotWhat: '', gotStuck: '', mistake: '', insight: '' });
    setOutcome(null);
    setShowProblem(!isDeep);
    setHistory([]);

    startRevision(active._id)
      .then((res) => {
        if (cancelled) return;
        startTimes.current[active._id] = startTimes.current[active._id] || Date.now();
        if (isDeep && res.history?.length) setHistory(res.history);
      })
      .catch(() => {
        // A failed start must not block recalling — the server still accepts
        // completion via the idempotent path.
      });

    return () => {
      cancelled = true;
    };
  }, [active?._id, isDeep]); // eslint-disable-line react-hooks/exhaustive-deps

  /* -------- reveal solution ------------------------------------------------ */
  const reveal = async () => {
    setStep('solution');
    if (isDeep && !history.length) {
      try {
        const res = await getHistory(active._id);
        setHistory(res.history || []);
      } catch {
        /* non-fatal */
      }
    }
    setTimeout(() => approachRef.current?.focus(), 50);
  };

  /* -------- complete the revision ----------------------------------------- */
  const complete = async () => {
    if (!rating || busy) return;
    setBusy(true);
    setError('');
    try {
      const startedAt = startTimes.current[active._id];
      const secondsSpent = startedAt ? Math.max(15, Math.round((Date.now() - startedAt) / 1000)) : 120;
      const payload = {
        result: rating,
        recalledApproach: approach,
        mode: mode === 'random' ? 'quick' : mode,
        secondsSpent,
      };
      const hasMistake = Object.values(mistake).some((v) => v && v.trim());
      if (hasMistake) payload.mistake = mistake;

      const res = await completeRevision(active._id, payload);
      ratedLog.current.push({
        id: active._id,
        result: rating,
        memoryAfter: res.memoryStrength,
        category: res.memoryCategory,
        interval: res.interval,
        next: res.nextReviewDateKey,
      });
      setOutcome(res);
      setStep('rated');
      refreshCounts();
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to record the revision');
    } finally {
      setBusy(false);
    }
  };

  /* -------- navigation ----------------------------------------------------- */
  const next = () => {
    if (index + 1 >= items.length) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
  };

  const skip = () => {
    if (index + 1 >= items.length) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
  };

  const summary = useMemo(() => {
    const byResult = { forgot: 0, hard: 0, good: 0, easy: 0 };
    ratedLog.current.forEach((r) => {
      byResult[r.result] = (byResult[r.result] || 0) + 1;
    });
    return byResult;
  }, [finished, index, step]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ============================ screens =================================== */

  if (loading) return <LoadingState label="Preparing your session…" minHeight="min-h-[60vh]" />;

  if (error && !items.length) {
    return <ErrorState title="Session failed" message={error} onRetry={load} />;
  }

  if (!items.length) {
    return (
      <Card>
        <EmptyState
          icon={CheckCircle2}
          title="Nothing to revise — queue clear 🎉"
          message="No questions are waiting. Solve something new and its first revision will be scheduled for today."
          action={
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/revision/session?mode=random&count=5')}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Random practice
              </button>
              <button
                onClick={() => navigate('/questions/new')}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                Add a question
              </button>
            </div>
          }
        />
      </Card>
    );
  }

  /* -------- completion summary -------------------------------------------- */
  if (finished) {
    const total = ratedLog.current.length;
    const weak = ratedLog.current.filter((r) => r.result === 'forgot' || r.result === 'hard');
    return (
      <div className="mx-auto max-w-2xl animate-in text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-xl shadow-indigo-500/25">
          <Trophy size={30} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Session complete</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          {total} revision{total === 1 ? '' : 's'} recorded · {items.length} question{items.length === 1 ? '' : 's'} in
          this session
        </p>

        <Card className="mt-6 p-5 text-left">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RATINGS.map((r) => (
              <div key={r} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-center">
                <div className={`text-2xl font-extrabold ${RESULT_META[r].color.split(' ')[0]}`}>
                  {summary[r]}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{RESULT_META[r].label}</div>
              </div>
            ))}
          </div>

          {weak.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-sm">
              <p className="flex items-center gap-2 font-semibold text-amber-300">
                <ShieldAlert size={15} /> Needs another pass soon
              </p>
              <ul className="mt-2 space-y-1 text-slate-300">
                {weak.map((r) => {
                  const q = items.find((x) => x._id === r.id);
                  return (
                    <li key={r.id} className="flex items-center gap-2">
                      <ResultBadge result={r.result} />
                      <span className="truncate">{q?.title}</span>
                      <span className="ml-auto shrink-0 text-xs text-slate-500">in {r.interval}d</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500">
            Your memory strength and next review dates were recalculated on the server.
          </p>
        </Card>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => navigate('/revision')}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
          >
            Back to queue
          </button>
          <button
            onClick={() => navigate('/revision/session?mode=random&count=5')}
            className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw size={14} className="mr-1.5 inline" />
            Random 5
          </button>
          <button
            onClick={() => navigate('/')}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-800"
          >
            Dashboard
          </button>
        </div>
      </div>
    );
  }

  /* -------- active question ------------------------------------------------ */
  const q = active;
  const rev = q.revision || {};
  const memoryBefore = rev.memoryStrength ?? 50;
  const rated = step === 'rated';

  return (
    <div className="mx-auto max-w-3xl animate-in">
      {/* Session header */}
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => navigate('/revision')}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          title="Leave session"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-2 font-medium uppercase tracking-wider text-indigo-300">
              {mode === 'deep' ? <Eye size={13} /> : <Zap size={13} />}
              {mode} session · Q{index + 1} of {items.length}
            </span>
            <span className="flex items-center gap-1">
              <Timer size={12} />
              recall first, reveal later
            </span>
          </div>
          <ProgressBar value={index + (rated ? 1 : 0)} max={items.length} className="mt-1.5 h-1.5" />
        </div>
      </div>

      {error && <div className="mb-4"><InlineError message={error} /></div>}

      {/* Question card */}
      <Card className="overflow-hidden">
        {/* Title bar */}
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-100">{q.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <DifficultyBadge difficulty={q.difficulty} />
                <StatusBadge status={q.status} />
                {(q.topics || []).slice(0, 4).map((t) => (
                  <TopicChip key={t} topic={t} />
                ))}
                {q.timeComplexity && (
                  <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[11px] text-cyan-300">
                    Time {q.timeComplexity}
                  </span>
                )}
                {q.spaceComplexity && (
                  <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[11px] text-cyan-300">
                    Space {q.spaceComplexity}
                  </span>
                )}
              </div>
            </div>
            <div className="hidden shrink-0 text-right sm:block">
              <CategoryBadge strength={rev.memoryStrength} category={rev.category} />
              <div className="mt-1.5 text-[11px] text-slate-500">
                {rev.revisionCount || 0} prior revision{(rev.revisionCount || 0) === 1 ? '' : 's'}
                {rev.lastResult ? ` · last: ${rev.lastResult}` : ''}
              </div>
              <div className="text-[11px] text-slate-500">
                {rev.lastReviewedAt ? relativeTime(rev.lastReviewedAt) : 'first revision'}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* ---------------- Step 1: active recall ---------------- */}
          {step === 'recall' && (
            <>
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
                <p className="text-sm font-semibold text-indigo-200">
                  🧠 Can you recall the approach before revealing anything?
                </p>
                <p className="mt-0.5 text-xs text-indigo-300/80">
                  Walk through the solution in your head first — that struggle is where memory is built.
                </p>
              </div>

              {/* Problem reveal */}
              {!showProblem ? (
                <button
                  onClick={() => setShowProblem(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 px-4 py-6 text-sm font-semibold text-slate-300 transition hover:border-indigo-500 hover:text-indigo-300"
                >
                  <Eye size={16} />
                  Show Problem
                </button>
              ) : (
                <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Problem statement
                    </span>
                    {isDeep && (
                      <button
                        onClick={() => setShowProblem(false)}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
                      >
                        <EyeOff size={12} /> hide
                      </button>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-slate-300">{q.description || 'No description stored.'}</p>
                  {q.externalLink && (
                    <a
                      href={q.externalLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-medium text-indigo-400 hover:text-indigo-300"
                    >
                      Open on {q.platform} ↗
                    </a>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  My recalled approach
                </label>
                <textarea
                  value={approach}
                  onChange={(e) => setApproach(e.target.value)}
                  rows={6}
                  placeholder="Describe the pattern, data structure and complexity you remember… e.g. “sliding window with a freq map, shrink when the window has duplicates — O(n)”"
                  className="w-full resize-y text-sm leading-relaxed"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Empty is fine — but typing what you remember makes the rating honest.
                </p>
              </div>

              <div className="flex justify-between border-t border-slate-800 pt-4">
                <button
                  onClick={skip}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
                >
                  <SkipForward size={14} /> Skip
                </button>
                <button
                  onClick={reveal}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500"
                >
                  <Eye size={16} /> Reveal Solution
                </button>
              </div>
            </>
          )}

          {/* ---------------- Step 2: compare + rate (+ 'rated' result view) --- */}
          {(step === 'solution' || step === 'rated') && (
            <>
              {/* Compare approaches */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <Lightbulb size={12} className="text-amber-400" /> Your approach (this session)
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                    {approach.trim() || <span className="text-slate-600">— nothing written —</span>}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                    Stored approach (reference)
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                    {q.approach || q.notes || 'No stored approach for this question.'}
                  </p>
                </div>
              </div>

              {/* Stored code reference */}
              {q.code && (
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
                  <CodeBlock code={q.code} language={q.language} />
                </div>
              )}

              {/* Deep-mode extras */}
              {isDeep && (
                <>
                  {q.notes && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Notes
                      </div>
                      <p className="text-sm leading-relaxed text-slate-300">{q.notes}</p>
                    </div>
                  )}
                  {(q.mistakes || []).length > 0 && (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                        <ShieldAlert size={12} /> Previous mistakes
                      </div>
                      <ul className="space-y-1.5 text-sm text-slate-300">
                        {q.mistakes.slice(-4).map((m, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                            <span>
                              {[m.forgotWhat, m.gotStuck, m.mistake, m.insight].filter(Boolean).join(' · ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {/* Rating */}
              <div className="border-t border-slate-800 pt-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-200">How well did you recall it?</label>
                  {outcome && (
                    <span className="text-[11px] text-slate-500">already recorded</span>
                  )}
                </div>
                <RatingPicker value={rating} onChange={setRating} disabled={rated} />

                {(rating === 'forgot' || rating === 'hard') && !rated && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowMistake((v) => !v)}
                      className="text-xs font-medium text-amber-400 hover:text-amber-300"
                    >
                      {showMistake ? '− hide mistake fields' : '+ capture what went wrong (recommended)'}
                    </button>
                    {showMistake && (
                      <div className="mt-2">
                        <MistakeForm value={mistake} onChange={setMistake} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Rated confirmation */}
              {rated && outcome && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-emerald-300">
                    <CheckCircle2 size={16} />
                    {outcome.duplicate ? 'Already recorded — no duplicate' : 'Revision recorded'}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300 sm:grid-cols-4">
                    <span>
                      Next review{' '}
                      <strong className="text-emerald-300">
                        {formatDate(`${outcome.nextReviewDateKey}T00:00:00`)}
                      </strong>
                    </span>
                    <span>
                      Interval <strong className="text-slate-100">{outcome.interval}d</strong>
                    </span>
                    <span>
                      Memory{' '}
                      <strong className={MEMORY_META[outcome.memoryCategory || 'Learning'].color}>
                        {outcome.memoryStrength}% {outcome.memoryCategory}
                      </strong>
                    </span>
                    <span className="text-slate-500">{RATING_EFFECTS[rating]}</span>
                  </div>
                  {code.trim() && (
                    <p className="mt-2 text-xs font-medium text-emerald-300/90">
                      💾 Your code was saved to this question
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                {!rated ? (
                  <>
                    <button
                      onClick={() => setStep('recall')}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
                    >
                      <ArrowLeft size={14} /> Back
                    </button>
                    <button
                      onClick={complete}
                      disabled={!rating || busy}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy && <Spinner size={15} />}
                      {busy ? 'Recording…' : 'Complete Revision'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={skip}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
                    >
                      <SkipForward size={14} /> Skip remaining
                    </button>
                    <button
                      onClick={next}
                      className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500"
                    >
                      {index + 1 >= items.length ? 'Finish Session' : 'Next Question'}
                      <ArrowRight size={16} />
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Slim footer: memory + schedule in one line */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2.5 text-xs text-slate-400">
        <span className="flex items-center gap-2">
          Memory
          <span className={`font-semibold ${MEMORY_META[rev.category || 'Learning'].color}`}>
            {rev.category || 'Learning'} · {memoryBefore}%
          </span>
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
            <span
              className={`block h-full rounded-full ${MEMORY_META[rev.category || 'Learning'].bar}`}
              style={{ width: `${Math.max(2, memoryBefore)}%` }}
            />
          </span>
        </span>
        <span>
          Next due <span className="text-slate-200">{formatDate(rev.nextReviewDate)}</span>
        </span>
        <span>
          Interval <span className="text-slate-200">{rev.interval || 0} days</span>
        </span>
        <span className="ml-auto hidden sm:inline">Forgot → 1d · Hard → 2d · Good → 7d · Easy → 14–30d</span>
      </div>
    </div>
  );
}

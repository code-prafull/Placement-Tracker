import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Play, CheckCircle2, XCircle, ChevronRight, History, Trophy, Target, RotateCcw,
} from 'lucide-react';
import { startInterview, getInterview, completeInterview, listInterviews } from '../services/extrasService';
import { LoadingState, Spinner } from '../components/common/Loading';
import { ErrorState, EmptyState, InlineError } from '../components/common/States';
import { Card, PageHeader, SectionTitle } from '../components/common/Layout';
import { DifficultyBadge, TopicChip } from '../components/common/Badges';
import { formatDate, relativeTime } from '../utils/dates';

/** 5 questions × ~60s each — countdown timer runs during the session. */
const SESSION_SECONDS = 5 * 60;

function fmtClock(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Interview() {
  const navigate = useNavigate();
  const [view, setView] = useState('setup'); // setup | quiz | result
  const [session, setSession] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({}); // questionId -> bool
  const [loading, setLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);

  /* countdown timer — ticks once per second during the quiz */
  useEffect(() => {
    if (view !== 'quiz') return undefined;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [view]);

  /* time up → auto-finish, unanswered = missed */
  useEffect(() => {
    if (view === 'quiz' && secondsLeft === 0 && session) {
      finish(answers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, view]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listInterviews();
      setSessions(res.sessions || []);
      setError('');
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to load interview history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const begin = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await startInterview({ count: 5 });
      setSession(res.session);
      setAnswers({});
      setStep(0);
      setSecondsLeft(SESSION_SECONDS);
      setView('quiz');
    } catch (err) {
      setError(err.friendlyMessage || 'Could not start a session');
    } finally {
      setBusy(false);
    }
  };

  const answer = (id, recalled) => {
    setAnswers((a) => ({ ...a, [id]: recalled }));
    setTimeout(() => {
      if (step + 1 >= session.questions.length) finish({ ...answers, [id]: recalled });
      else setStep((s) => s + 1);
    }, 250);
  };

  const finish = async (finalAnswers) => {
    setBusy(true);
    setError('');
    try {
      const payload = Object.entries(finalAnswers).map(([questionId, recalled]) => ({
        questionId,
        recalled,
      }));
      const res = await completeInterview(session.id, payload);
      setSession(res.session);
      setView('result');
      loadHistory();
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to save the session');
    } finally {
      setBusy(false);
    }
  };

  const skipRest = () => {
    // unanswered questions count as "not recalled"
    const merged = { ...answers };
    session.questions.forEach((q) => {
      if (!(q.id in merged)) merged[q.id] = false;
    });
    finish(merged);
  };

  /* ---------------------------------------------------------------- render */

  return (
    <div className="animate-in">
      <PageHeader
        title="Interview Mode"
        subtitle="Blind mock interviews from your own bank — recall only, no peeking. Missed questions feed your weak queue."
      />

      {error && <div className="mb-4"><InlineError message={error} /></div>}

      {/* ------------------------------ QUIZ ------------------------------ */}
      {view === 'quiz' && session && (
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex items-center justify-between text-sm text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-indigo-300">
              Question {step + 1} of {session.questions.length}
            </span>
            {/* countdown timer */}
            <span
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-mono text-sm font-bold ${
                secondsLeft <= 30
                  ? 'bg-rose-500/15 text-rose-400'
                  : secondsLeft <= 60
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-slate-800 text-slate-200'
              }`}
            >
              ⏱ {fmtClock(secondsLeft)}
            </span>
          </div>
          <ProgressBarNow value={step + 1} max={session.questions.length} />

          <Card className="mt-5 p-6 text-center">
            {(() => {
              const q = session.questions[step];
              return (
                <>
                  <div className="mb-4 flex items-center justify-center gap-2">
                    <DifficultyBadge difficulty={q.difficulty} />
                  </div>
                  <h2 className="text-xl font-bold text-slate-100">{q.title}</h2>
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    {(q.topics || []).map((t) => (
                      <TopicChip key={t} topic={t} />
                    ))}
                  </div>

                  <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-slate-400">
                    In an interview, this would be read to you. Walk through the approach out loud in your head —
                    then rate yourself honestly.
                  </p>

                  <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      onClick={() => answer(q.id, true)}
                      disabled={busy}
                      className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-4 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      <CheckCircle2 size={18} /> I recalled it
                    </button>
                    <button
                      onClick={() => answer(q.id, false)}
                      disabled={busy}
                      className="flex items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-5 py-4 text-sm font-bold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      <XCircle size={18} /> Missed it
                    </button>
                  </div>
                </>
              );
            })()}
          </Card>

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={skipRest}
              disabled={busy}
              className="text-sm font-medium text-slate-500 hover:text-slate-300"
            >
              Finish early (miss the rest)
            </button>
            <button
              onClick={() => setView('setup')}
              className="text-sm font-medium text-slate-500 hover:text-slate-300"
            >
              Abandon session
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------ RESULT ---------------------------- */}
      {view === 'result' && session && (
        <div className="mx-auto max-w-2xl animate-in text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-xl shadow-indigo-500/25">
            <Trophy size={30} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Mock interview complete</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            You recalled{' '}
            <strong className="text-emerald-400">{session.score}</strong> of{' '}
            <strong className="text-slate-200">{session.total}</strong> questions
          </p>

          <Card className="mt-6 p-5 text-left">
            <div className="mb-4 h-3 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${session.total ? (session.score / session.total) * 100 : 0}%` }}
              />
            </div>

            {session.weakArea && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-amber-300">
                  <Target size={15} /> Weak area detected: <span className="text-amber-200">{session.weakArea}</span>
                </p>
                <p className="mt-1 text-xs text-amber-200/70">
                  Missed questions automatically carry more weight in your revision queue.
                </p>
              </div>
            )}

            <ul className="mt-4 space-y-2">
              {session.questions.map((q) => {
                const recalled = answers[q.id];
                return (
                  <li key={q.id} className="flex items-center gap-2 text-sm">
                    {recalled ? (
                      <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle size={15} className="shrink-0 text-rose-400" />
                    )}
                    <button
                      onClick={() => navigate(`/questions/${q.id}`)}
                      className="flex-1 truncate text-left text-slate-300 hover:text-indigo-300"
                    >
                      {q.title}
                    </button>
                    <DifficultyBadge difficulty={q.difficulty} />
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => navigate('/revision')}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
            >
              Revise weak questions
            </button>
            <button
              onClick={() => setView('setup')}
              className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              <RotateCcw size={14} className="mr-1.5 inline" /> Another session
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------ SETUP ----------------------------- */}
      {view === 'setup' && (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <SectionTitle>New mock session</SectionTitle>
              <p className="mb-5 text-sm leading-relaxed text-slate-400">
                The server picks <strong className="text-slate-200">5 prioritised questions</strong> — forgotten and
                weak ones first, spread across topics. You only see the title and topics; the approach stays hidden
                until you rate yourself. Timer chalta rahega — 5 minute me finish karo.
              </p>

              <button
                onClick={begin}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {busy ? <Spinner size={16} /> : <Play size={16} />}
                {busy ? 'Selecting questions…' : 'Start 5-question mock interview (5:00)'}
              </button>

              <p className="mt-3 text-center text-[11px] text-slate-500">
                Only <strong>solved</strong> questions are used — interview mode tests retention, not discovery.
              </p>
            </Card>

            <Card className="p-6">
              <SectionTitle>How it works</SectionTitle>
              <ol className="space-y-3 text-sm text-slate-400">
                {[
                  'A title appears — no problem text, no code.',
                  'Recall the pattern out loud (active recall).',
                  'Rate yourself honestly: recalled or missed.',
                  'Missed topics get flagged as your weak area.',
                ].map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-indigo-500/15 text-[11px] font-bold text-indigo-300">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          {/* History */}
          <div className="mt-6">
            <SectionTitle action={<History size={15} className="text-slate-500" />}>
              Past sessions
            </SectionTitle>
            {loading ? (
              <LoadingState label="Loading history…" minHeight="min-h-[120px]" />
            ) : sessions?.length ? (
              <Card className="divide-y divide-slate-800">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-3.5 text-sm">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                        s.status === 'completed'
                          ? (s.score / Math.max(1, s.total)) >= 0.7
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-amber-500/15 text-amber-300'
                          : 'bg-slate-700/40 text-slate-400'
                      }`}
                    >
                      {s.status === 'completed' ? `${s.score}/${s.total}` : '—'}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium text-slate-200">
                        {s.status === 'completed' ? 'Completed session' : 'Abandoned session'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatDate(s.startedAt)} · {relativeTime(s.startedAt)}
                        {s.weakArea && <> · weak area: <span className="text-amber-400">{s.weakArea}</span></>}
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">
                      {s.topicBreakdown?.length
                        ? `${s.topicBreakdown.length} topics`
                        : ''}
                    </span>
                  </div>
                ))}
              </Card>
            ) : (
              <Card>
                <EmptyState
                  icon={Users}
                  title="No mock interviews yet"
                  message="Run your first session — it takes 3 minutes and shows exactly what would slip in a real interview."
                  compact
                />
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ProgressBarNow({ value, max }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

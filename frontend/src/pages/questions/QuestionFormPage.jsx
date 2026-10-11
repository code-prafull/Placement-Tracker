import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, X, Plus } from 'lucide-react';
import { getQuestion, createQuestion, updateQuestion, getFacets } from '../../services/questionService';
import { LoadingState, Spinner } from '../../components/common/Loading';
import { ErrorState, InlineError } from '../../components/common/States';
import { Card, PageHeader } from '../../components/common/Layout';
import { TopicChip } from '../../components/common/Badges';
import { PLATFORMS } from '../../utils/constants';

const EMPTY = {
  title: '',
  description: '',
  examples: [], // [{input, output, explanation}]
  constraintsText: '', // newline separated → constraints[]
  hintsText: '', // newline separated → hints[]
  platform: 'LeetCode',
  externalLink: '',
  difficulty: 'Medium',
  topics: [],
  companies: [],
  status: 'todo',
  notes: '',
  approach: '',
  code: '',
  language: 'C++',
  timeComplexity: '',
  spaceComplexity: '',
};

/** Form state → API payload (strings → arrays, drops client-only fields). */
function toPayload(form) {
  const { constraintsText, hintsText, examples, ...rest } = form;
  return {
    ...rest,
    examples: (examples || [])
      .map((e) => ({ input: e.input?.trim() || '', output: e.output?.trim() || '', explanation: e.explanation?.trim() || '' }))
      .filter((e) => e.input || e.output || e.explanation),
    constraints: constraintsText.split('\n').map((s) => s.trim()).filter(Boolean),
    hints: hintsText.split('\n').map((s) => s.trim()).filter(Boolean),
  };
}

/** API question → form state (arrays → textareas). */
function fromApi(q) {
  return {
    ...EMPTY,
    ...q,
    topics: q.topics || [],
    companies: q.companies || [],
    examples: (q.examples || []).map((e) => ({ ...e })),
    constraintsText: (q.constraints || []).join('\n'),
    hintsText: (q.hints || []).join('\n'),
  };
}

function Field({ label, hint, children, required }) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-slate-300">
        {label}
        {required && <span className="text-rose-400">*</span>}
        {hint && <span className="ml-auto text-[11px] font-normal text-slate-500">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function TagEditor({ values, onChange, placeholder, suggestions = [] }) {
  const [draft, setDraft] = useState('');
  const add = (raw) => {
    const v = raw.trim();
    if (!v || values.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...values, v]);
    setDraft('');
  };
  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={placeholder}
          className="flex-1 text-sm"
        />
        <button
          type="button"
          onClick={() => add(draft)}
          className="rounded-lg border border-slate-700 px-3 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          aria-label="Add"
        >
          <Plus size={15} />
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="flex items-center gap-1 rounded-md border border-indigo-500/40 bg-indigo-500/10 py-0.5 pl-2 pr-1 text-xs text-indigo-300"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="rounded p-0.5 hover:bg-indigo-500/30"
                aria-label={`Remove ${v}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {suggestions
            .filter((s) => !values.includes(s))
            .slice(0, 12)
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange([...values, s])}
                className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
              >
                + {s}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export default function QuestionFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [facets, setFacets] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    getFacets()
      .then((res) => setFacets(res.facets || res))
      .catch(() => {});
    if (!isEdit) return undefined;
    setLoading(true);
    getQuestion(id)
      .then((res) => {
        setForm(fromApi(res.question));
      })
      .catch((err) => setError(err.friendlyMessage || 'Failed to load question'))
      .finally(() => setLoading(false));
    return undefined;
  }, [id, isEdit]);

  const platforms = useMemo(() => {
    const set2 = new Set([...PLATFORMS, ...(facets?.platforms || [])]);
    return [...set2];
  }, [facets]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSavedMsg('');
    try {
      if (isEdit) {
        await updateQuestion(id, toPayload(form));
        navigate(`/questions/${id}`);
      } else {
        const res = await createQuestion(toPayload(form));
        setSavedMsg(res.message || 'Saved');
        if (res.question?.status === 'solved') {
          navigate(`/questions/${res.question._id}`);
        } else {
          setForm({ ...EMPTY });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading…" />;

  return (
    <div className="mx-auto max-w-3xl animate-in">
      <button
        onClick={() => navigate(isEdit ? `/questions/${id}` : '/questions')}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-400 transition hover:text-slate-200"
      >
        <ArrowLeft size={15} /> Cancel
      </button>

      <PageHeader
        title={isEdit ? 'Edit Question' : 'Add Question'}
        subtitle={
          isEdit
            ? 'Update your stored solution and notes. Revision history stays untouched.'
            : 'Store it now so the scheduler can bring it back before you forget it.'
        }
      />

      {error && <div className="mb-4"><InlineError message={error} /></div>}
      {savedMsg && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {savedMsg}
        </div>
      )}

      <form onSubmit={submit}>
        <Card className="space-y-5 p-5">
          <Field label="Title" required hint="Ctrl+Enter submits">
            <input
              type="text"
              required
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. Sliding Window Maximum"
              className="w-full"
              autoFocus={!isEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </Field>

          <Field label="Problem statement" hint="paraphrase it in your own words">
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={4}
              placeholder="What does the problem ask? Write it your way — that's part of the storage step."
              className="w-full resize-y text-sm leading-relaxed"
            />
          </Field>

          {/* ---------- LeetCode-style examples ---------- */}
          <div>
            <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-slate-300">
              Examples
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, examples: [...f.examples, { input: '', output: '', explanation: '' }] }))
                }
                className="ml-auto flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
              >
                <Plus size={13} /> Add example
              </button>
            </label>
            <div className="space-y-3">
              {form.examples.map((ex, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Example {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, examples: f.examples.filter((_, j) => j !== i) }))}
                      className="text-slate-500 hover:text-rose-400"
                      aria-label={`Remove example ${i + 1}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {[
                    ['input', 'Input', '2 7 11 15\n9'],
                    ['output', 'Output', '[0, 1]'],
                    ['explanation', 'Explanation', 'nums[0] + nums[1] == 9'],
                  ].map(([key, label, ph]) => (
                    <textarea
                      key={key}
                      value={ex[key] || ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          examples: f.examples.map((x, j) => (j === i ? { ...x, [key]: e.target.value } : x)),
                        }))
                      }
                      rows={key === 'explanation' ? 2 : 1}
                      placeholder={`${label}: ${ph}`}
                      className="w-full resize-y whitespace-pre rounded-lg border border-slate-800 bg-[#050810] p-2.5 font-mono text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Constraints" hint="one per line">
              <textarea
                value={form.constraintsText}
                onChange={set('constraintsText')}
                rows={4}
                placeholder={'1 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9'}
                className="w-full resize-y whitespace-pre rounded-xl border border-slate-800 bg-[#050810] p-3 font-mono text-xs leading-relaxed text-slate-300 focus:border-indigo-500 focus:outline-none"
              />
            </Field>
            <Field label="Hints" hint="one per line">
              <textarea
                value={form.hintsText}
                onChange={set('hintsText')}
                rows={4}
                placeholder={'Have you tried a hash map?\nWhat about two pointers?'}
                className="w-full resize-y text-sm leading-relaxed"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Difficulty">
              <select value={form.difficulty} onChange={set('difficulty')} className="w-full text-sm">
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={set('status')} className="w-full text-sm">
                <option value="todo">To do</option>
                <option value="solving">Solving</option>
                <option value="solved">Solved</option>
              </select>
            </Field>
            <Field label="Platform">
              <select value={form.platform} onChange={set('platform')} className="w-full text-sm">
                {platforms.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Problem link">
              <input
                type="url"
                value={form.externalLink}
                onChange={set('externalLink')}
                placeholder="https://leetcode.com/problems/…"
                className="w-full text-sm"
              />
            </Field>
            <Field label="Language">
              <input
                type="text"
                value={form.language}
                onChange={set('language')}
                placeholder="JavaScript"
                className="w-full text-sm"
              />
            </Field>
          </div>

          <Field label="Topics" hint="Enter or click + to add">
            <TagEditor
              values={form.topics}
              onChange={(v) => setForm((f) => ({ ...f, topics: v }))}
              placeholder="Array, Two Pointers…"
              suggestions={facets?.topics || []}
            />
          </Field>

          <Field label="Companies" hint="asked by">
            <TagEditor
              values={form.companies}
              onChange={(v) => setForm((f) => ({ ...f, companies: v }))}
              placeholder="Google, Amazon…"
              suggestions={facets?.companies || []}
            />
          </Field>

          <Field label="My approach" hint="the pattern you used">
            <textarea
              value={form.approach}
              onChange={set('approach')}
              rows={4}
              placeholder="e.g. monotonic deque keeps window max in O(1) — pop smaller elements from the back"
              className="w-full resize-y text-sm leading-relaxed"
            />
          </Field>

          <Field label="Code" hint={`${form.language || 'code'} — press Tab to indent`}>
            <textarea
              value={form.code}
              onChange={set('code')}
              rows={10}
              spellCheck={false}
              placeholder={'function solve(input) {\n  // ...\n}'}
              className="w-full resize-y whitespace-pre rounded-xl border border-slate-800 bg-[#050810] p-4 font-mono text-xs leading-relaxed text-slate-300 focus:border-indigo-500 focus:outline-none"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Time complexity">
              <input
                type="text"
                value={form.timeComplexity}
                onChange={set('timeComplexity')}
                placeholder="O(n)"
                className="w-full text-sm"
              />
            </Field>
            <Field label="Space complexity">
              <input
                type="text"
                value={form.spaceComplexity}
                onChange={set('spaceComplexity')}
                placeholder="O(k)"
                className="w-full text-sm"
              />
            </Field>
          </div>

          <Field label="Notes" hint="edge cases, pitfalls">
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              placeholder="e.g. k can exceed the array length; window shrinks at the end"
              className="w-full resize-y text-sm leading-relaxed"
            />
          </Field>
        </Card>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {form.status === 'solved'
              ? 'Solving it today? The first revision will be scheduled for today.'
              : 'Marking it solved schedules its first revision for today.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate(isEdit ? `/questions/${id}` : '/questions')}
              className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? <Spinner size={15} /> : <Save size={15} />}
              {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add to bank'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

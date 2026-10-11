import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, FileJson, FileSpreadsheet, CheckCircle2, AlertTriangle, UploadCloud,
} from 'lucide-react';
import { importCsv, importJson, templateUrl } from '../../services/extrasService';
import { Spinner } from '../../components/common/Loading';
import { InlineError } from '../../components/common/States';
import { Card, PageHeader, SectionTitle } from '../../components/common/Layout';
import { ConfirmDialog } from '../../components/common/Modal';

const CSV_COLUMNS = [
  ['title', 'required — question name'],
  ['difficulty', 'Easy / Medium / Hard'],
  ['topic', 'semicolon-separated: Array; Hashing'],
  ['platform', 'LeetCode, GeeksforGeeks, …'],
  ['url', 'problem link'],
  ['description', 'problem statement'],
  ['approach', 'your approach'],
  ['notes', 'pitfalls & notes'],
  ['status', 'todo / solving / solved (optional)'],
  ['companies', 'semicolon-separated'],
];

export default function ImportQuestions() {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [content, setContent] = useState('');
  const [format, setFormat] = useState(null); // 'csv' | 'json'
  const [defaultStatus, setDefaultStatus] = useState('solved');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const pick = async (f) => {
    if (!f) return;
    setError('');
    setResult(null);
    const isJson = /\.json$/i.test(f.name) || f.type === 'application/json';
    const isCsv = /\.csv$/i.test(f.name) || f.type === 'text/csv';
    if (!isJson && !isCsv) {
      setError('Only .csv and .json files are supported.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('File too large (max 5 MB).');
      return;
    }
    try {
      const text = await f.text();
      setFile(f);
      setContent(text);
      setFormat(isJson ? 'json' : 'csv');
      if (isJson) {
        try {
          JSON.parse(text);
        } catch {
          setError('This file does not look like valid JSON.');
        }
      }
    } catch {
      setError('Could not read the file.');
    }
  };

  const run = async () => {
    if (!content || busy) return;
    setBusy(true);
    setError('');
    try {
      const res =
        format === 'json'
          ? await importJson(content, defaultStatus)
          : await importCsv(content, defaultStatus);
      setResult(res);
      setConfirmReplace(false);
    } catch (err) {
      setError(err.friendlyMessage || 'Import failed');
      setConfirmReplace(false);
    } finally {
      setBusy(false);
    }
  };

  const previewRows = (() => {
    if (format !== 'csv' || !content) return [];
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    return lines.slice(0, 6);
  })();

  return (
    <div className="mx-auto max-w-3xl animate-in">
      <button
        onClick={() => navigate('/questions')}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-400 transition hover:text-slate-200"
      >
        <ArrowLeft size={15} /> Back to questions
      </button>

      <PageHeader
        title="Import Questions"
        subtitle="Bulk upload from CSV or JSON. The server validates every row and reports what was skipped."
        actions={
          <a
            href={templateUrl}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
            download="dsaforge-import-template.csv"
          >
            <Download size={15} /> CSV template
          </a>
        }
      />

      {error && <div className="mb-4"><InlineError message={error} /></div>}

      {/* Dropzone */}
      {!result && (
        <Card
          className={`p-8 text-center transition ${
            dragOver ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-dashed'
          }`}
          onClick={null}
        >
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className="flex flex-col items-center"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/60">
              <UploadCloud size={26} className="text-indigo-400" />
            </div>
            {file ? (
              <div className="flex items-center gap-2 text-sm text-slate-200">
                {format === 'json' ? <FileJson size={16} className="text-amber-400" /> : <FileSpreadsheet size={16} className="text-emerald-400" />}
                <span className="font-semibold">{file.name}</span>
                <span className="text-slate-500">({(file.size / 1024).toFixed(1)} KB · {format.toUpperCase()})</span>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-200">Drop your file here</p>
                <p className="mt-1 text-xs text-slate-500">CSV or JSON · up to 5 MB</p>
              </>
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
            >
              {file ? 'Choose a different file' : 'Browse files'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </div>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15">
              <CheckCircle2 size={22} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Import finished</h2>
              <p className="text-sm text-slate-400">
                {result.imported ?? 0} imported
                {result.skipped ? ` · ${result.skipped} skipped` : ''}
                {result.invalid ? ` · ${result.invalid} invalid` : ''}
              </p>
            </div>
          </div>

          {result.errors?.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
                <AlertTriangle size={15} /> Row problems
              </p>
              <ul className="max-h-52 space-y-1 overflow-y-auto text-xs text-amber-200/90">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => navigate('/questions')}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
            >
              View my question bank
            </button>
            <button
              onClick={() => {
                setResult(null);
                setFile(null);
                setContent('');
                setFormat(null);
              }}
              className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              Import another file
            </button>
          </div>
        </Card>
      )}

      {/* Options + preview + format help */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Import options</SectionTitle>
          <label className="block text-sm font-medium text-slate-300">Default status for imported rows</label>
          <p className="mb-2 mt-0.5 text-xs text-slate-500">
            Applies to rows without a status column. Solved rows are scheduled for their first revision today.
          </p>
          <select
            value={defaultStatus}
            onChange={(e) => setDefaultStatus(e.target.value)}
            className="w-full text-sm"
          >
            <option value="solved">Solved (schedule revision today)</option>
            <option value="solving">Solving</option>
            <option value="todo">To do</option>
          </select>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => (file ? setConfirmReplace(true) : inputRef.current?.click())}
              disabled={!content || busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? <Spinner size={15} /> : <UploadCloud size={16} />}
              {busy ? 'Importing…' : `Import ${format ? format.toUpperCase() : 'file'}`}
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Duplicate titles are skipped (unique per user), invalid rows are reported individually — your
            existing data is never touched.
          </p>
        </Card>

        <Card className="p-5">
          <SectionTitle>{format === 'json' ? 'Expected JSON shape' : 'CSV columns'}</SectionTitle>
          {format === 'json' ? (
            <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-[#050810] p-4 text-xs leading-relaxed text-slate-300">
              <code>{`[
  {
    "title": "Two Sum",
    "difficulty": "Easy",
    "topics": ["Array", "Hashing"],
    "platform": "LeetCode",
    "url": "https://…",
    "description": "…",
    "approach": "…",
    "notes": "…",
    "status": "solved",
    "companies": ["Google"]
  }
]`}</code>
            </pre>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {CSV_COLUMNS.map(([col, desc]) => (
                <li key={col} className="flex gap-2">
                  <span className="w-24 shrink-0 font-mono font-semibold text-indigo-300">{col}</span>
                  <span className="text-slate-500">{desc}</span>
                </li>
              ))}
            </ul>
          )}

          {previewRows.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Preview (first {previewRows.length} lines)
              </p>
              <pre className="max-h-36 overflow-auto rounded-lg border border-slate-800 bg-[#050810] p-3 text-[11px] leading-relaxed text-slate-400">
                <code>{previewRows.join('\n')}</code>
              </pre>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        onConfirm={run}
        title={`Import ${format.toUpperCase()} now?`}
        message={`Rows will be added to your question bank with status “${defaultStatus}”. Solved rows get their first revision scheduled for today.`}
        confirmLabel="Start import"
        busy={busy}
      />
    </div>
  );
}

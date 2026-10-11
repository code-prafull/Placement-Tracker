import { useState } from 'react';
import { Play, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { runCode } from '../../services/codeService';
import { Spinner } from '../common/Loading';

const STARTER = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // yahan apna code likho — input se padho, output print karo
    int x;
    if (cin >> x) cout << x * 2 << "\\n";

    return 0;
}
`;

/**
 * In-app C++ playground: paste/write code, add input, run it on the server.
 * Used on the question page + revision session so users can "run in C++".
 */
export default function CodePlayground({ initialCode = '', initialStdin = '', height = 'h-64', code: controlledCode, onCodeChange }) {
  const [open, setOpen] = useState(false);
  const [internalCode, setInternalCode] = useState(initialCode || STARTER);
  const [stdin, setStdin] = useState(initialStdin || '');
  const [output, setOutput] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const isControlled = typeof controlledCode === 'string';
  const code = isControlled ? controlledCode : internalCode;
  const setCode = (v) => (isControlled ? onCodeChange?.(v) : setInternalCode(v));

  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await runCode({ language: 'cpp', code, stdin });
      setOutput(res);
    } catch (e) {
      setErr(e.friendlyMessage || 'Could not run code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/50"
      >
        <Terminal size={15} className="text-emerald-400" />
        C++ Playground
        <span className="ml-1 text-[11px] font-normal text-slate-500">code likho, input do, run karo</span>
        <span className="ml-auto text-slate-500">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-800 p-4">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            rows={12}
            className={`w-full ${height} resize-y whitespace-pre rounded-xl border border-slate-800 bg-[#050810] p-4 font-mono text-xs leading-relaxed text-slate-300 focus:border-emerald-500 focus:outline-none`}
          />
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Input (stdin)
            </label>
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              rows={3}
              placeholder={'3 1 4 2\n7'}
              className="w-full resize-y whitespace-pre rounded-lg border border-slate-800 bg-[#050810] p-3 font-mono text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <button
            onClick={run}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {busy ? <Spinner size={15} /> : <Play size={15} />}
            {busy ? 'Running…' : 'Run C++'}
          </button>

          {err && <p className="text-sm text-rose-400">{err}</p>}

          {output && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
                <span
                  className={
                    output.timedOut
                      ? 'text-amber-400'
                      : output.stage === 'compile'
                        ? 'text-rose-400'
                        : output.ok
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                  }
                >
                  {output.timedOut
                    ? 'Timed out'
                    : output.stage === 'compile'
                      ? 'Compilation error'
                      : output.ok
                        ? 'Success'
                        : `Exited with code ${output.code}`}
                </span>
              </div>
              {output.stdout && (
                <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-[#050810] p-3 text-xs leading-relaxed text-slate-200">
                  <code>{output.stdout}</code>
                </pre>
              )}
              {output.stderr && (
                <pre className="overflow-x-auto rounded-lg border border-rose-900/40 bg-rose-950/20 p-3 text-xs leading-relaxed text-rose-300">
                  <code>{output.stderr}</code>
                </pre>
              )}
              {!output.stdout && !output.stderr && (
                <p className="text-xs text-slate-500">No output.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

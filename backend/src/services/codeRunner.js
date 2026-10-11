import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Run C++ code on the host (spec: in-app playground).
 *
 * This is intentionally small and safe for a *personal, self-hosted* tool:
 *  - code lives in a throwaway temp dir which is always deleted
 *  - compile + run are both hard-capped by a wall-clock timeout
 *  - stdout/stderr are truncated so a runaway loop can't flood memory
 *  - the child runs with no extra privileges
 *
 * It is NOT a multi-tenant sandbox — do not expose this to untrusted users.
 *
 * Toolchain discovery: some managed Windows machines ship an enterprise App
 * Control (WDAC) policy that blocks MSYS2's cc1plus.exe, so we probe each
 * candidate compiler once (zig first — it's bundled in ../tools and is a
 * single signed-off binary — then g++) and cache the first that works.
 */

const COMPILE_TIMEOUT_MS = 15000;
const PROBE_TIMEOUT_MS = 60000; // first zig compile warms its cache, give it room
const RUN_TIMEOUT_MS = 3000;
const MAX_OUTPUT = 40000; // ~40 KB of output kept per stream

const HERE = path.dirname(fileURLToPath(import.meta.url)); // backend/src/services
const ROOT = path.resolve(HERE, '../../..'); // DSAForge root
const TOOLS_DIR = path.join(ROOT, 'tools');
const SHIM_INCLUDE_DIR = path.join(TOOLS_DIR, 'cpp-include');

/** Portable stand-in for GCC's <bits/stdc++.h> (zig/clang don't ship it). */
const STDC_SHIM = `// Auto-generated shim: makes #include <bits/stdc++.h> work on non-GCC toolchains.
#pragma once
#include <algorithm>
#include <array>
#include <bitset>
#include <cassert>
#include <cctype>
#include <chrono>
#include <climits>
#include <cmath>
#include <complex>
#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <deque>
#include <functional>
#include <iomanip>
#include <iostream>
#include <iterator>
#include <limits>
#include <list>
#include <map>
#include <memory>
#include <numeric>
#include <optional>
#include <queue>
#include <random>
#include <regex>
#include <set>
#include <sstream>
#include <stack>
#include <string>
#include <tuple>
#include <type_traits>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <valarray>
#include <vector>
`;

async function ensureShim() {
  try {
    await mkdir(path.join(SHIM_INCLUDE_DIR, 'bits'), { recursive: true });
    await writeFile(path.join(SHIM_INCLUDE_DIR, 'bits', 'stdc++.h'), STDC_SHIM, 'utf8');
  } catch {
    /* shim is best-effort — compile still works without <bits/stdc++.h> */
  }
}

/** Find bundled zig (tools/zig-<version>/zig.exe) or honour DSAFORGE_ZIG. */
async function findZig() {
  if (process.env.DSAFORGE_ZIG) return process.env.DSAFORGE_ZIG;
  try {
    const entries = await readdir(TOOLS_DIR, { withFileTypes: true });
    const dir = entries.find((e) => e.isDirectory() && /^zig-/i.test(e.name));
    if (!dir) return null;
    const exe = path.join(TOOLS_DIR, dir.name, 'zig.exe');
    const { access } = await import('node:fs/promises');
    await access(exe);
    return exe;
  } catch {
    return null;
  }
}

function compilerArgs(entry, srcPath, binPath) {
  if (entry.kind === 'zig') {
    return ['c++', '-O2', '-std=c++17', '-isystem', SHIM_INCLUDE_DIR, '-o', binPath, srcPath];
  }
  return ['-O2', '-std=c++17', '-isystem', SHIM_INCLUDE_DIR, '-o', binPath, srcPath];
}

const PROBE_CODE = [
  '#include <iostream>',
  '#include <vector>',
  '#include <algorithm>',
  'int main(){ std::vector<int> v{3,1,2}; std::sort(v.begin(), v.end()); std::cout << v[0] << v[1] << v[2]; return 0; }',
  '',
].join('\n');

/** Candidates in preference order; lazily probed once and cached. */
let toolchain = null; // { kind, cmd, name } | { ok: false, reason }

async function probeToolchain() {
  if (toolchain) return toolchain;
  await ensureShim();

  const zig = await findZig();
  const candidates = [];
  if (zig) candidates.push({ kind: 'zig', cmd: zig, name: 'zig (bundled clang)' });
  candidates.push({ kind: 'gpp', cmd: 'g++', name: 'g++ (mingw)' });

  const failures = [];
  for (const entry of candidates) {
    const dir = await mkdtemp(path.join(tmpdir(), 'dsaforge-probe-'));
    const srcPath = path.join(dir, 'probe.cpp');
    const binPath = path.join(dir, 'probe.exe');
    try {
      await writeFile(srcPath, PROBE_CODE, 'utf8');
      const res = await run(entry.cmd, compilerArgs(entry, srcPath, binPath), {
        cwd: dir,
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      if (res.code === 0) {
        toolchain = entry;
        return toolchain;
      }
      failures.push(`${entry.name}: ${(res.stderr || 'compile failed').trim()}`);
    } catch (err) {
      failures.push(`${entry.name}: ${err.message}`);
    } finally {
      rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  toolchain = {
    ok: false,
    reason:
      'C++ compiler start nahi ho paya (koi bhi toolchain available nahi hai / policy block kar rahi hai).\n\n' +
      'Fix options:\n' +
      '  1. `tools/` me zig rakh do (ziglang.org se zip → tools/ me extract), ya\n' +
      '  2. MSYS2 g++ install karo, ya\n' +
      '  3. Visual Studio Build Tools + Windows SDK install karo (MSVC).\n\n' +
      'Detail:\n  ' + failures.join('\n  '),
  };
  return toolchain;
}

function run(cmd, args, { cwd, input, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* already dead */
      }
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + `\n${err.message}`, code: -1, timedOut });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });

    if (input !== undefined && input !== null) {
      child.stdin.write(String(input));
    }
    child.stdin.end();
  });
}

export async function runCpp(code, stdin = '') {
  const source = String(code || '');
  if (!source.trim()) {
    return { ok: false, stage: 'compile', stdout: '', stderr: 'Empty source file.', code: -1, timedOut: false };
  }
  if (source.length > 200000) {
    return { ok: false, stage: 'compile', stdout: '', stderr: 'Source too large (200 KB max).', code: -1, timedOut: false };
  }

  const tc = await probeToolchain();
  if (tc.ok === false) {
    return { ok: false, stage: 'compile', stdout: '', stderr: tc.reason, code: -1, timedOut: false };
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'dsaforge-'));
  const srcPath = path.join(dir, 'main.cpp');
  const binPath = path.join(dir, 'main.exe');

  try {
    await writeFile(srcPath, source, 'utf8');

    const compiled = await run(tc.cmd, compilerArgs(tc, srcPath, binPath), {
      cwd: dir,
      timeoutMs: COMPILE_TIMEOUT_MS,
    });

    if (compiled.timedOut) {
      return {
        ok: false,
        stage: 'compile',
        stdout: compiled.stdout,
        stderr: 'Compilation timed out (infinite loop / huge template?).',
        code: -1,
        timedOut: true,
      };
    }
    if (compiled.code !== 0) {
      return {
        ok: false,
        stage: 'compile',
        stdout: compiled.stdout,
        stderr: compiled.stderr || 'Compilation failed.',
        code: compiled.code,
        timedOut: false,
      };
    }

    const ran = await run(binPath, [], { cwd: dir, input: stdin, timeoutMs: RUN_TIMEOUT_MS });
    return {
      ok: !ran.timedOut && ran.code === 0,
      stage: 'run',
      stdout: ran.stdout,
      stderr: ran.stderr,
      code: ran.code,
      timedOut: ran.timedOut,
    };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

import { MEMORY_META, memoryCategory } from '../../utils/constants';

/**
 * Memory strength — the single most important metric on a question card.
 * The score itself is ALWAYS computed by the backend from revision history.
 */
export function MemoryMeter({ strength = 50, category, showLabel = true, compact = false }) {
  const cat = category || memoryCategory(strength);
  const meta = MEMORY_META[cat];
  const pct = Math.max(0, Math.min(100, Math.round(strength)));

  return (
    <div className={compact ? 'w-full' : 'w-full max-w-xs'}>
      {showLabel && (
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-slate-400">Memory strength</span>
          <span className={`font-semibold ${meta.color}`}>
            {cat} · {pct}%
          </span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${meta.bar} transition-all duration-700`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

export function ProgressBar({ value, max = 100, className = '', barClass = 'bg-indigo-500' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full bg-slate-800 ${className}`}>
      <div className={`h-full rounded-full ${barClass} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

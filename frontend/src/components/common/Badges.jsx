import { DIFFICULTY_META, MEMORY_META, RESULT_META, memoryCategory } from '../../utils/constants';

export function DifficultyBadge({ difficulty = 'Medium', className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${DIFFICULTY_META[difficulty] || DIFFICULTY_META.Medium} ${className}`}
    >
      {difficulty}
    </span>
  );
}

export function CategoryBadge({ strength, category, className = '' }) {
  const cat = category || memoryCategory(strength ?? 50);
  const meta = MEMORY_META[cat];
  return (
    <span className={`inline-flex items-center rounded-md border border-transparent px-2 py-0.5 text-xs font-semibold ${meta.bg} ${meta.color} ${className}`}>
      {cat}
    </span>
  );
}

export function ResultBadge({ result, className = '' }) {
  const meta = RESULT_META[result];
  if (!meta) return null;
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.color} ${className}`}>
      {meta.label}
    </span>
  );
}

export function TopicChip({ topic, onClick = null, active = false }) {
  const Comp = onClick ? 'button' : 'span';
  return (
    <Comp
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(topic); } : undefined}
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs transition ${
        active
          ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
          : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:border-slate-600'
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      {topic}
    </Comp>
  );
}

export function StatusBadge({ status }) {
  const map = {
    solved: { label: 'Solved', cls: 'text-emerald-400 bg-emerald-500/10' },
    solving: { label: 'Solving', cls: 'text-amber-400 bg-amber-500/10' },
    todo: { label: 'To do', cls: 'text-slate-400 bg-slate-500/10' },
  };
  const m = map[status] || map.solving;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

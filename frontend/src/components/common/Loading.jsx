import { Loader2 } from 'lucide-react';

export function Spinner({ size = 20, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}

export function LoadingState({ label = 'Loading…', minHeight = 'min-h-[240px]' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${minHeight} text-slate-400`}>
      <Spinner size={26} className="text-indigo-400" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonRows({ rows = 5, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-14 w-full" />
      ))}
    </div>
  );
}

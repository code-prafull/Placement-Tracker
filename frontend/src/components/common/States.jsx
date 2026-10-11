import { AlertTriangle, Inbox } from 'lucide-react';

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', message, action = null, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-14'} px-6`}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-800/60">
        <Icon size={24} className="text-slate-400" />
      </div>
      <h3 className="text-base font-semibold text-slate-200">{title}</h3>
      {message && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-400">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry = null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10">
        <AlertTriangle size={22} className="text-rose-400" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {message && <p className="mt-1 max-w-md text-sm text-slate-400">{message}</p>}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg border border-slate-700 bg-slate-800/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-700/70"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function InlineError({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}


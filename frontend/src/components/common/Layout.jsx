export function PageHeader({ title, subtitle, actions = null, badge = null }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '', onClick = null }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-slate-800 bg-slate-900/60 ${onClick ? 'cursor-pointer transition hover:border-slate-700 hover:bg-slate-900' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, action = null, className = '' }) {
  return (
    <div className={`mb-3 flex items-center justify-between ${className}`}>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{children}</h2>
      {action}
    </div>
  );
}

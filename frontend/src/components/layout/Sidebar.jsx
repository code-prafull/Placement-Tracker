import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ListChecks, CalendarCheck, Map, CalendarDays,
  Flame, Users, Settings, X, Zap,
} from 'lucide-react';
import { useQueue } from '../../context/QueueContext';

const MAIN_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/daily', label: 'Daily Practice', icon: CalendarDays, highlight: true },
  { to: '/questions', label: 'My Questions', icon: ListChecks },
  { to: '/roadmap', label: 'DSA Topics', icon: Map },
  { to: '/revision', label: "Today's Revision", icon: CalendarCheck, highlight: true, dueBadge: true },
  { to: '/habit', label: 'Habit & Performance', icon: Flame },
  { to: '/interview', label: 'Interview Mode', icon: Users },
];

const BOTTOM_NAV = [{ to: '/settings', label: 'Settings', icon: Settings }];

function NavItem({ item, onNavigate }) {
  const { to, label, icon: Icon, end, highlight, dueBadge } = item;
  const { dueTotal } = useQueue();
  const showBadge = Boolean(dueBadge && dueTotal > 0);

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-indigo-500/15 text-indigo-300'
            : highlight && dueTotal > 0
              ? 'text-slate-200 hover:bg-slate-800/70'
              : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {(highlight && dueTotal > 0) || isActive ? (
            <span
              className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full ${
                isActive ? 'bg-indigo-400' : 'bg-amber-400'
              }`}
            />
          ) : null}
          <Icon
            size={17}
            className={
              isActive
                ? 'text-indigo-400'
                : highlight && dueTotal > 0
                  ? 'text-amber-400'
                  : 'text-slate-500 group-hover:text-slate-300'
            }
          />
          <span className="flex-1">{label}</span>
          {showBadge && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                isActive ? 'bg-indigo-500 text-white' : 'bg-amber-400/90 text-slate-950'
              }`}
            >
              {dueTotal}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Mobile scrim */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-[#0a1120] transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/25">
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-slate-100">DSAForge</div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                Revision OS
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 lg:hidden" aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            Revise
          </p>
          {MAIN_NAV.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={onClose} />
          ))}

          <div className="my-3 border-t border-slate-800" />

          {BOTTOM_NAV.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={onClose} />
          ))}
        </nav>

        <div className="border-t border-slate-800 px-5 py-4">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Solve → Store → <span className="font-semibold text-indigo-400">Revise</span> → Recall → Master
          </p>
        </div>
      </aside>
    </>
  );
}

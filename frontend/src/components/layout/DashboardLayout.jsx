import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Menu, Plus, Upload, Search, LogOut } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { useQueue } from '../../context/QueueContext';

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const { dueTotal } = useQueue();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-800 bg-[#070b14]/85 px-4 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <button
            onClick={() => navigate('/questions?focus=search')}
            className="hidden flex-1 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-500 transition hover:border-slate-700 hover:text-slate-400 sm:flex sm:max-w-sm"
          >
            <Search size={15} />
            Search questions…
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => navigate('/revision')}
              className={`hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition sm:flex ${
                dueTotal > 0
                  ? 'bg-amber-400/15 text-amber-300 hover:bg-amber-400/25'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              {dueTotal > 0 ? `${dueTotal} due` : 'Queue clear'}
            </button>
            <button
              onClick={() => navigate('/questions/new')}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Add</span>
            </button>
            <button
              onClick={() => navigate('/questions/import')}
              className="rounded-lg border border-slate-700 p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              aria-label="Import questions"
              title="Import CSV/JSON"
            >
              <Upload size={16} />
            </button>
            <div className="hidden items-center gap-2 border-l border-slate-800 pl-3 md:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 text-xs font-bold text-white">
                {(user?.name || '?').charAt(0).toUpperCase()}
              </div>
              <span className="max-w-[120px] truncate text-sm text-slate-300">{user?.name}</span>
              <button
                onClick={handleLogout}
                className="rounded p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-rose-400"
                title="Log out"
                aria-label="Log out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </header>

        <main className="h-[calc(100vh-3.5rem)] overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 [&:has(.flex.h-full)]:px-3 [&:has(.flex.h-full)]:py-3">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

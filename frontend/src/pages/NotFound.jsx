import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';
import { Card } from '../components/common/Layout';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/60">
          <Compass size={28} className="text-indigo-400" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-100">404</h1>
        <p className="mt-2 text-sm text-slate-400">
          This page doesn't exist — probably forgot its own route.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
        >
          <Home size={15} /> Back to dashboard
        </Link>
      </Card>
    </div>
  );
}

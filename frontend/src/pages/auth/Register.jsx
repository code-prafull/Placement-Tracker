import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { InlineError } from '../../components/common/States';
import { Spinner } from '../../components/common/Loading';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setBusy(true);
    try {
      await register(form.name, form.email, form.password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.friendlyMessage || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md animate-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-xl shadow-indigo-500/25">
            <Zap size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Build your revision OS</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Store every question you solve. Never let it fade.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/30">
          <form onSubmit={submit} className="space-y-4">
            {error && <InlineError message={error} />}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Name</label>
              <input type="text" required value={form.name} onChange={set('name')} placeholder="Ada Lovelace" className="w-full" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
              <input type="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" className="w-full" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
                <input type="password" required value={form.password} onChange={set('password')} placeholder="min. 6 chars" className="w-full" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Confirm</label>
                <input type="password" required value={form.confirm} onChange={set('confirm')} placeholder="repeat" className="w-full" />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy && <Spinner size={16} />}
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

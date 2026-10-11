import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Save, SlidersHorizontal, UserCog } from 'lucide-react';
import { updateProfile } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/common/Loading';
import { InlineError } from '../components/common/States';
import { Card, PageHeader, SectionTitle } from '../components/common/Layout';

export default function Settings() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({
    name: user?.name || '',
    dailyRevisionGoal: user?.preferences?.dailyRevisionGoal ?? 10,
    dailySolveGoal: user?.preferences?.dailySolveGoal ?? 3,
  });
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const [profileMsg, setProfileMsg] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const [busyP, setBusyP] = useState(false);
  const [busyW, setBusyW] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusyP(true);
    setProfileErr('');
    setProfileMsg('');
    try {
      const res = await updateProfile({
        name: profile.name,
        dailyRevisionGoal: Number(profile.dailyRevisionGoal),
        dailySolveGoal: Number(profile.dailySolveGoal),
      });
      updateUser(res.user);
      setProfileMsg('Preferences saved');
    } catch (err) {
      setProfileErr(err.friendlyMessage || 'Failed to save preferences');
    } finally {
      setBusyP(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwdErr('');
    setPwdMsg('');
    if (pwd.newPassword.length < 6) {
      setPwdErr('New password must be at least 6 characters');
      return;
    }
    if (pwd.newPassword !== pwd.confirm) {
      setPwdErr('Passwords do not match');
      return;
    }
    setBusyW(true);
    try {
      await updateProfile({
        currentPassword: pwd.currentPassword,
        newPassword: pwd.newPassword,
      });
      setPwd({ currentPassword: '', newPassword: '', confirm: '' });
      setPwdMsg('Password updated');
    } catch (err) {
      setPwdErr(err.friendlyMessage || 'Password change failed');
    } finally {
      setBusyW(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl animate-in">
      <PageHeader title="Settings" subtitle="Goals drive your dashboard plan — keep them honest." />

      <div className="space-y-5">
        {/* Profile & goals */}
        <Card className="p-5">
          <SectionTitle action={<UserCog size={15} className="text-slate-500" />}>Profile & goals</SectionTitle>
          {profileMsg && (
            <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {profileMsg}
            </div>
          )}
          {profileErr && <div className="mb-3"><InlineError message={profileErr} /></div>}
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Display name</label>
              <input
                type="text"
                required
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
              <input type="email" value={user?.email || ''} disabled className="w-full opacity-60" />
              <p className="mt-1 text-[11px] text-slate-500">Email changes are not supported yet.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  Daily revision goal
                </label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={profile.dailyRevisionGoal}
                  onChange={(e) => setProfile((p) => ({ ...p, dailyRevisionGoal: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Daily solve goal</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={profile.dailySolveGoal}
                  onChange={(e) => setProfile((p) => ({ ...p, dailySolveGoal: e.target.value }))}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busyP}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {busyP ? <Spinner size={15} /> : <Save size={15} />}
                Save preferences
              </button>
            </div>
          </form>
        </Card>

        {/* Password */}
        <Card className="p-5">
          <SectionTitle action={<KeyRound size={15} className="text-slate-500" />}>Change password</SectionTitle>
          {pwdMsg && (
            <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {pwdMsg}
            </div>
          )}
          {pwdErr && <div className="mb-3"><InlineError message={pwdErr} /></div>}
          <form onSubmit={savePassword} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Current password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={pwd.currentPassword}
                onChange={(e) => setPwd((p) => ({ ...p, currentPassword: e.target.value }))}
                className="w-full"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">New password</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={pwd.newPassword}
                  onChange={(e) => setPwd((p) => ({ ...p, newPassword: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Confirm new</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={pwd.confirm}
                  onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busyW}
                className="flex items-center gap-2 rounded-xl bg-slate-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-600 disabled:opacity-60"
              >
                {busyW ? <Spinner size={15} /> : <KeyRound size={15} />}
                Update password
              </button>
            </div>
          </form>
        </Card>

        {/* Info */}
        <Card className="p-5">
          <SectionTitle action={<SlidersHorizontal size={15} className="text-slate-500" />}>How scheduling works</SectionTitle>
          <ul className="space-y-2 text-sm leading-relaxed text-slate-400">
            <li>• First revision is scheduled for the day you mark a question solved.</li>
            <li>• Ratings: <strong className="text-rose-400">Forgot</strong> → tomorrow, <strong className="text-orange-400">Hard</strong> → ~2d, <strong className="text-emerald-400">Good</strong> → ×2 interval, <strong className="text-cyan-300">Easy</strong> → long interval.</li>
            <li>• Memory strength is computed from your rating history — it can never be edited manually.</li>
            <li>• Revision history is immutable: rows are written once and never modified.</li>
          </ul>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => navigate('/revision')}
              className="rounded-lg bg-indigo-600/90 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
            >
              Go to revision queue
            </button>
            <button
              onClick={() => navigate('/habit')}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              View profile
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

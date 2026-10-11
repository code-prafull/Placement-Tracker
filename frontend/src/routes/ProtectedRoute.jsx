import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/common/Loading';

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <div className="flex flex-col items-center gap-3">
          <Spinner size={30} className="text-indigo-400" />
          <p className="text-sm text-slate-500">Loading DSAForge…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

export function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <Spinner size={30} className="text-indigo-400" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return children;
}

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getCounts } from '../services/revisionService';
import { useAuth } from './AuthContext';

/**
 * Lightweight queue counters shared by the sidebar badge and headers.
 * Refreshed after every completed revision so the badge never lies.
 */
const QueueContext = createContext(null);

export function QueueProvider({ children }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCounts(null);
      return;
    }
    try {
      const data = await getCounts();
      setCounts(data.counts);
      setError(null);
    } catch (err) {
      setError(err.friendlyMessage || 'Failed to load queue counts');
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const dueTotal = counts ? counts.due + counts.overdue : 0;

  return (
    <QueueContext.Provider value={{ counts, dueTotal, refresh, error }}>
      {children}
    </QueueContext.Provider>
  );
}

export function useQueue() {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error('useQueue must be used inside <QueueProvider>');
  return ctx;
}

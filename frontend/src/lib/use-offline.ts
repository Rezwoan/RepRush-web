'use client';
import { useEffect, useState } from 'react';
import { pendingCount, subscribe, startAutoSync, flushOutbox } from './offline';

/**
 * Connectivity + outbox state for the UI. `navigator.onLine` is optimistic (it
 * only reports link status, not reachability), so a failed request also flips
 * us offline via `reportOffline`.
 */
export function useOffline() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);
    setPending(pendingCount());

    const sync = () => setPending(pendingCount());
    const goOnline = () => { setOnline(true); void flushOutbox().then(sync); };
    const goOffline = () => setOnline(false);

    const unsub = subscribe(sync);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    startAutoSync();

    return () => {
      unsub();
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { online, pending };
}

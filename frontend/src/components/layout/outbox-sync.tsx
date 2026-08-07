'use client';
/**
 * Starts the outbox auto-sync once, for the whole app.
 *
 * This used to be started only by `OfflineBanner`, which lives inside the tab
 * shell — and the active session screen is deliberately outside it. So a
 * session logged with no signal sat in localStorage until the user happened to
 * open a tab screen: they would finish their workout, walk out of the gym, get
 * signal back, and nothing would sync. Caught by P6's offline exit check.
 *
 * Renders nothing. It belongs in the root layout precisely because the thing it
 * fixes is a route that opts out of every other layout.
 */
import { useEffect } from 'react';
import { startAutoSync } from '@/lib/offline';

export default function OutboxSync() {
  useEffect(() => {
    startAutoSync();
  }, []);
  return null;
}

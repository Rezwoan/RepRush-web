'use client';
/**
 * The hook that feeds the Profile tab.
 *
 * Separate from `page.tsx` because a Next.js page file may only export the
 * default — anything else is a build error. The card itself moved to
 * `components/profile/profile-card.tsx`, where `/u/[username]` can render the
 * same one rather than a lookalike.
 */
import { useCallback, useEffect, useState } from 'react';
import { profileApi } from '@/lib/api';
import type { Overview } from './types';

const CACHE_KEY = 'reprush_profile_v1';

function readCache(): Overview | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Overview) : null;
  } catch {
    return null;
  }
}

export function useProfile() {
  const [data, setData] = useState<Overview | null>(null);
  const [ready, setReady] = useState(false);
  const [window_, setWindow] = useState(7);

  const load = useCallback(async (days = 7) => {
    try {
      const res = await profileApi.me(days);
      setData(res.data);
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(res.data));
      } catch {
        /* quota — the cache is an optimisation */
      }
    } catch {
      /* keep whatever the cache gave us */
    }
  }, []);

  useEffect(() => {
    setData(readCache());
    setReady(true);
    load(7);
  }, [load]);

  const changeWindow = useCallback(
    (days: number) => {
      setWindow(days);
      load(days);
    },
    [load],
  );

  return { data, ready, reload: load, window: window_, changeWindow, setData };
}

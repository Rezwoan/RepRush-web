'use client';
/**
 * The profile header and the hook that feeds it.
 *
 * Separate from `page.tsx` because a Next.js page file may only export the
 * default — anything else is a build error, and Edit Profile previews with the
 * real header rather than a copy of it.
 */
import { useCallback, useEffect, useState } from 'react';
import { profileApi } from '@/lib/api';
import { Mascot, type MascotPose } from '@/components/art/mascot';
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

// ── header ──────────────────────────────────────────────────────────

export function ProfileHeaderCard({
  header,
  level,
  onEdit,
}: {
  header: Overview['header'];
  level?: number;
  onEdit?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="h-24 w-full" style={{ background: header.cosmetics.banner.paint }} />
      <div className="relative bg-card px-4 pb-4">
        <div
          className="absolute -top-9 left-4 grid h-[74px] w-[74px] place-items-center rounded-full p-[3px]"
          style={{ background: header.cosmetics.border.paint }}
        >
          <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-card">
            {header.profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={header.profileImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <Mascot pose={(header.avatarId as MascotPose) || 'idle'} size={56} />
            )}
          </span>
          {level !== undefined && (
            <span className="nums absolute -bottom-1 right-0 rounded-full bg-primary-fill px-1.5 py-0.5 text-[10px] font-extrabold text-primary-foreground">
              {level}
            </span>
          )}
        </div>
        {/* The avatar is absolute and hangs 38px into this card, so the name
            needs that much clearance. It used to come from the height of the
            Edit button — which Edit Profile's own live preview does not render,
            so there the avatar sat on top of the name. Reserve it explicitly:
            the row is the same height whether the button is there or not. */}
        <div className="flex h-9 items-center justify-end">
          {onEdit && (
            <button onClick={onEdit} className="press text-sm font-bold text-primary">
              Edit profile
            </button>
          )}
        </div>
        <div className="mt-3">
          <h1 className="text-2xl font-extrabold leading-tight">{header.name}</h1>
          {header.username && <p className="text-sm text-muted-foreground">@{header.username}</p>}
          <span
            className="mt-2 inline-block rounded-lg px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white"
            style={{ background: header.cosmetics.title.paint }}
          >
            {header.cosmetics.title.label}
          </span>
          {header.bio && <p className="mt-3 text-sm">{header.bio}</p>}
        </div>
      </div>
    </div>
  );
}


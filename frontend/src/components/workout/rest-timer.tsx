'use client';
/**
 * The rest timer (SPEC §5.2, §5.3).
 *
 * **Background-safe by construction.** It stores the wall-clock instant the
 * rest ends and derives the remaining seconds from `Date.now()` on every tick,
 * rather than decrementing a counter. A decrementing counter is wrong the
 * moment the phone locks — browsers throttle `setInterval` in a background tab
 * to once a minute or stop it entirely, so a 90-second rest would still read 80
 * seconds when the screen came back on. That is the whole reason this is a hook
 * and not four lines inside the session page.
 *
 * The deadline also lives in localStorage, so leaving the session screen — or
 * reloading it — does not lose the rest you are in the middle of.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SkipForward, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

const KEY = 'reprush_rest_v1';

interface Stored {
  endsAt: number;
  totalSec: number;
}

const read = (): Stored | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Stored) : null;
    return v && v.endsAt > Date.now() ? v : null;
  } catch {
    return null;
  }
};

/**
 * A short two-tone chime, synthesised rather than shipped as an audio file.
 * WebAudio is already in every browser; a bundled mp3 is bytes plus a fetch
 * that fails exactly when the gym wifi does.
 */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.24);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    /* audio is a nicety; never let it break the logging path */
  }
}

export const buzz = (pattern: number | number[] = 40) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported — the visual state is the real feedback */
  }
};

export interface RestTimer {
  /** Seconds left, 0 when idle. */
  remaining: number;
  totalSec: number;
  active: boolean;
  start: (seconds: number) => void;
  skip: () => void;
  add: (seconds: number) => void;
}

export function useRestTimer(onFinish?: () => void): RestTimer {
  const [state, setState] = useState<Stored | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const finished = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Read localStorage in an effect, never during render, so the server pass and
  // the first client pass agree.
  useEffect(() => setState(read()), []);

  useEffect(() => {
    if (!state) return;
    finished.current = false;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 250);
    // A throttled background tab misses ticks; catching up on wake is what
    // makes the countdown correct rather than merely animated.
    const wake = () => tick();
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [state]);

  const remaining = state ? Math.max(0, Math.ceil((state.endsAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!state || remaining > 0 || finished.current) return;
    finished.current = true;
    chime();
    buzz([80, 60, 120]);
    onFinishRef.current?.();
    localStorage.removeItem(KEY);
    setState(null);
  }, [remaining, state]);

  const start = useCallback((seconds: number) => {
    if (!(seconds > 0)) return;
    const next = { endsAt: Date.now() + seconds * 1000, totalSec: seconds };
    localStorage.setItem(KEY, JSON.stringify(next));
    setNow(Date.now());
    setState(next);
  }, []);

  const skip = useCallback(() => {
    finished.current = true;
    localStorage.removeItem(KEY);
    setState(null);
  }, []);

  const add = useCallback((seconds: number) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, endsAt: prev.endsAt + seconds * 1000, totalSec: prev.totalSec + seconds };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { remaining, totalSec: state?.totalSec ?? 0, active: remaining > 0, start, skip, add };
}

export const mmss = (sec: number) =>
  `${String(Math.floor(Math.max(0, sec) / 60)).padStart(2, '0')}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`;

export const hhmmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  return `${String(h).padStart(2, '0')}:${mmss(s - h * 3600)}`;
};

/**
 * The docked mini-bar (SPEC §5.3) — sits above the tab bar so the rest survives
 * navigating away from the session.
 */
export function RestMiniBar({ timer, className }: { timer: RestTimer; className?: string }) {
  const pct = timer.totalSec ? timer.remaining / timer.totalSec : 0;
  const r = 13;
  const c = 2 * Math.PI * r;

  return (
    <AnimatePresence>
      {timer.active && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          className={cn(
            'fixed inset-x-0 bottom-[72px] z-40 mx-auto flex max-w-2xl items-center gap-3',
            'border-t border-border bg-primary px-4 py-2.5 text-primary-foreground',
            className,
          )}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90 shrink-0">
            <circle cx="16" cy="16" r={r} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={3} />
            <circle
              cx="16"
              cy="16"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct)}
            />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">Resting</p>
            <p className="nums text-lg font-extrabold leading-none">{mmss(timer.remaining)}</p>
          </div>
          <button
            onClick={() => timer.add(30)}
            className="press rounded-full bg-white/20 px-3 py-1.5 text-xs font-extrabold"
          >
            +30s
          </button>
          <button
            onClick={timer.skip}
            aria-label="Skip rest"
            className="press grid h-9 w-9 place-items-center rounded-full bg-white/20"
          >
            <SkipForward size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { Timer as TimerIcon };

// ── self-check ────────────────────────────────────────────────────
export const __selfcheck = () => {
  if (mmss(0) !== '00:00') throw new Error('rest-timer: zero should format as 00:00');
  if (mmss(86) !== '01:26') throw new Error('rest-timer: 86s should read 01:26');
  if (mmss(-5) !== '00:00') throw new Error('rest-timer: a negative rest must clamp, not show a minus');
  if (hhmmss(45) !== '00:00:45') throw new Error('rest-timer: session clock should be hh:mm:ss');
  if (hhmmss(3725) !== '01:02:05') throw new Error('rest-timer: hours should carry');
  return 'rest timer ok';
};

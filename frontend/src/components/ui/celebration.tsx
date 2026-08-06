'use client';
/**
 * Celebration overlay — the full-screen moment behind rank-ups, medals, streaks
 * and level-ups. Rays + confetti + a spring-in hero, over a tinted scrim.
 *
 * Rewards arrive in bursts (a session can finish with XP, two rank-ups, a medal
 * and a streak all at once), so this is designed to be driven by a queue rather
 * than opened ad hoc — see `useCelebrationQueue`.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';
import { useSvgId } from '@/lib/svg-id';

// ── Rays ────────────────────────────────────────────────────────────
export function Rays({
  count = 14,
  color = 'hsl(var(--tier-gold))',
  className,
  spin = true,
}: {
  count?: number;
  color?: string;
  className?: string;
  spin?: boolean;
}) {
  const uid = useSvgId('rays');
  const wedges = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (360 / count) * i;
        const w = 360 / count / 2.4;
        const rad = (d: number) => ((d - 90) * Math.PI) / 180;
        const x1 = 100 + 160 * Math.cos(rad(a - w));
        const y1 = 100 + 160 * Math.sin(rad(a - w));
        const x2 = 100 + 160 * Math.cos(rad(a + w));
        const y2 = 100 + 160 * Math.sin(rad(a + w));
        return `M100 100 L${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
      }),
    [count],
  );

  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 h-full w-full', spin && 'animate-rays-spin', className)}
    >
      <defs>
        <radialGradient id={`${uid}-fade`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={color} stopOpacity={0.55} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <g fill={`url(#${uid}-fade)`}>
        {wedges.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

// ── Confetti ────────────────────────────────────────────────────────
const CONFETTI_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(var(--tier-platinum))',
  'hsl(var(--tier-diamond))',
];

export function Confetti({ count = 26, seed = 0 }: { count?: number; seed?: number }) {
  // Deterministic pseudo-random so server and client agree and pieces don't
  // jump on hydration. A real RNG here causes a mismatch warning every time.
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const r = (n: number) => ((Math.sin((i + 1) * (n + 1) * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1;
        return {
          left: r(1) * 100,
          delay: r(2) * 0.5,
          duration: 1.6 + r(3) * 1.4,
          rotate: r(4) * 720 - 360,
          color: CONFETTI_COLORS[Math.floor(r(5) * CONFETTI_COLORS.length)],
          w: 5 + r(6) * 5,
          h: 9 + r(7) * 8,
        };
      }),
    [count, seed],
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 rounded-[2px]"
          style={{ left: `${p.left}%`, width: p.w, height: p.h, background: p.color }}
          initial={{ y: -40, opacity: 0, rotate: 0 }}
          animate={{ y: '110vh', opacity: [0, 1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

// ── Overlay ─────────────────────────────────────────────────────────
export interface CelebrationProps {
  open: boolean;
  onDismiss: () => void;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** The badge / medal / mascot that owns the moment. */
  hero: React.ReactNode;
  actionLabel?: string;
  secondaryAction?: React.ReactNode;
  rayColor?: string;
  confetti?: boolean;
  className?: string;
}

export function Celebration({
  open,
  onDismiss,
  eyebrow,
  title,
  subtitle,
  hero,
  actionLabel = 'Continue',
  secondaryAction,
  rayColor,
  confetti = true,
  className,
}: CelebrationProps) {
  // Enter/escape dismiss, so the queue can be cleared from a keyboard.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onDismiss]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          className={cn(
            'fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 px-8',
            'bg-background/95 backdrop-blur-md',
            className,
          )}
        >
          {confetti && <Confetti />}

          <div className="relative grid h-64 w-64 place-items-center">
            <Rays color={rayColor} />
            <motion.div
              initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ ...spring.bouncy, delay: 0.1 }}
              className="relative"
            >
              {hero}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, ...spring.soft }}
            className="text-center"
          >
            {eyebrow && (
              <p className="mb-1 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                {eyebrow}
              </p>
            )}
            <h2 className="text-3xl font-extrabold">{title}</h2>
            {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, ...spring.soft }}
            className="flex w-full max-w-sm items-center gap-3"
          >
            {secondaryAction}
            <button
              onClick={onDismiss}
              className="h-14 flex-1 rounded-xl border-b-4 border-b-black/25 bg-foreground text-base font-extrabold uppercase tracking-wider text-background transition-[filter,transform,border] hover:brightness-95 active:translate-y-[3px] active:border-b-[1px]"
            >
              {actionLabel}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Plays a list of celebrations one at a time, in order.
 * Push rewards in the order they should be experienced: XP → rank → medal → streak.
 */
export function useCelebrationQueue<T>() {
  const [queue, setQueue] = useState<T[]>([]);
  const push = useCallback((items: T | T[]) => {
    setQueue((q) => [...q, ...(Array.isArray(items) ? items : [items])]);
  }, []);
  const next = useCallback(() => setQueue((q) => q.slice(1)), []);
  const clear = useCallback(() => setQueue([]), []);
  return { current: queue[0] ?? null, remaining: queue.length, push, next, clear };
}

// ── Coach mark ──────────────────────────────────────────────────────
export function CoachMark({
  open,
  onNext,
  step,
  total,
  text,
  /** Screen rect to punch out of the scrim, from `getBoundingClientRect()`. */
  target,
  actionLabel = 'Got it',
}: {
  open: boolean;
  onNext: () => void;
  step: number;
  total: number;
  text: React.ReactNode;
  target?: DOMRect | null;
  actionLabel?: string;
}) {
  const pad = 8;
  const below = !target || target.top < window.innerHeight / 2;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70]"
        >
          {/* Scrim with a hole cut over the target. box-shadow is the cheapest
              spotlight that still lets the real element show through. */}
          <div
            className="absolute inset-0 bg-black/70"
            style={
              target
                ? {
                    background: 'transparent',
                    boxShadow: '0 0 0 9999px rgba(0,0,0,.72)',
                    borderRadius: 18,
                    top: target.top - pad,
                    left: target.left - pad,
                    width: target.width + pad * 2,
                    height: target.height + pad * 2,
                    position: 'fixed',
                  }
                : undefined
            }
            onClick={onNext}
          />
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.soft}
            className="absolute inset-x-6 max-w-sm rounded-2xl border border-border bg-popover p-5 shadow-lift md:left-1/2 md:-translate-x-1/2"
            style={
              target
                ? below
                  ? { top: target.bottom + 20 }
                  : { bottom: window.innerHeight - target.top + 20 }
                : { bottom: 120 }
            }
          >
            <div className="text-[15px] font-medium leading-snug">{text}</div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                {step} / {total}
              </span>
              <button
                onClick={onNext}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                {step === total ? actionLabel : 'Next'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

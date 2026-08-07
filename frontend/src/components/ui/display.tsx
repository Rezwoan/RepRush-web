'use client';
/** Read-only display primitives: progress rings, bars and empty states. */
import { motion } from 'framer-motion';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import { Mascot, type MascotPose } from '@/components/art/mascot';

// ── Ring ────────────────────────────────────────────────────────────
export interface RingProps {
  /** 0–1. Values above 1 are clamped for the arc but kept for the label. */
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
  className?: string;
  label?: string;
}

export function Ring({
  value,
  size = 120,
  thickness = 10,
  color = 'hsl(var(--primary))',
  track = 'hsl(var(--muted-foreground) / 0.18)',
  children,
  className,
  label,
}: RingProps) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        role={label ? 'img' : 'presentation'}
        aria-label={label}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
      )}
    </div>
  );
}

/** Concentric rings — calories outside, macros inside. */
export function RingStack({
  rings,
  size = 140,
  gap = 12,
  children,
  className,
}: {
  rings: { value: number; color: string; label?: string }[];
  size?: number;
  gap?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      {rings.map((r, i) => {
        const s = size - i * gap * 2;
        return (
          <div key={i} className="absolute" style={{ inset: i * gap }}>
            <Ring value={r.value} size={s} thickness={Math.max(6, 10 - i)} color={r.color} label={r.label} />
          </div>
        );
      })}
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}

// ── Bar ─────────────────────────────────────────────────────────────
export function Bar({
  value,
  color = 'hsl(var(--primary))',
  className,
  height = 8,
  label,
}: {
  value: number;
  color?: string;
  className?: string;
  height?: number;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-muted-foreground/20', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct * 100}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────
export function EmptyState({
  title,
  description,
  action,
  pose = 'idle',
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  pose?: MascotPose;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <Mascot pose={pose} size={96} float />
      <h3 className="text-lg font-bold">{title}</h3>
      {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 w-full max-w-xs">{action}</div>}
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────
/**
 * The shimmer block. The `.skeleton` class has existed since P1 and nothing
 * used it: every tab rendered `null` until its first response landed, so the
 * app opened on a blank screen and then jumped.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />;
}

/**
 * The first paint of a data tab: a sub-tab strip and a few cards, at roughly
 * the heights the real ones occupy, so the content lands rather than shoves.
 * `aria-busy` is what a screen reader needs — the shimmer says nothing to it.
 */
export function TabSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-3 py-1">
      <Skeleton className="h-10 w-full rounded-xl" />
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-2xl" />
      ))}
    </div>
  );
}

// ── Stat tile ───────────────────────────────────────────────────────
export function StatTile({
  label,
  value,
  unit,
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('surface flex-1 p-4', className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="nums mt-1 text-2xl font-extrabold leading-none">
        {value}
        {unit && <span className="ml-1 text-base font-semibold text-muted-foreground">{unit}</span>}
      </p>
      {sub && <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

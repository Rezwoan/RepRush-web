'use client';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';

interface Props {
  value: number;
  max?: number;
  color?: 'brand' | 'volt' | 'success' | 'current';
  className?: string;
  height?: string;
  glow?: boolean;
}

const fills: Record<string, string> = {
  brand: 'bg-brand-gradient',
  volt: 'bg-volt-gradient',
  success: 'bg-success',
  current: 'bg-current',
};

export function Progress({
  value,
  max = 100,
  color = 'brand',
  className,
  height = 'h-2',
  glow,
}: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn('w-full rounded-full bg-secondary overflow-hidden', height, className)}>
      <motion.div
        className={cn(
          'h-full rounded-full',
          fills[color],
          glow && color === 'brand' && 'shadow-glow-brand',
          glow && color === 'volt' && 'shadow-glow-volt',
        )}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={spring.soft}
      />
    </div>
  );
}

/** Circular progress ring (e.g. daily targets). */
export function RingProgress({
  value,
  max = 100,
  size = 72,
  stroke = 7,
  color = 'brand',
  hex,
  children,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: 'brand' | 'volt';
  hex?: string; // arbitrary colour override (e.g. user-chosen creatine colour)
  children?: React.ReactNode;
}) {
  const pct = Math.min(1, Math.max(0, value / max));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gid = hex ? `ring-hex-${hex.replace('#', '')}` : `ring-${color}`;
  const stop = hex || (color === 'volt' ? '#faba0c' : '#0a80f5');
  const start = hex || (color === 'volt' ? '#e0a009' : '#3b97f5');
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={start} />
            <stop offset="100%" stopColor={stop} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={spring.gentle}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

'use client';
/**
 * Equipment glyphs — one per equipment type, tinted by the exercise's primary
 * muscle group. This is the exercise-list thumbnail.
 *
 * Deliberately a glyph, not an illustrated figure: per-exercise artwork can't be
 * produced or licensed without the owner sourcing it, and 200 mismatched
 * clip-art figures would look worse than one consistent icon set.
 */
import { cn } from '@/lib/utils';
import type { MuscleGroup } from '@/lib/muscles';

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'bodyweight',
  'kettlebell',
  'band',
  'plate',
] as const;

export type Equipment = (typeof EQUIPMENT)[number];

/** Paths are authored in a 32×32 box, stroke-based so they stay crisp when small. */
const GLYPH: Record<Equipment, React.ReactNode> = {
  barbell: (
    <>
      <path d="M3 16h2M27 16h2" />
      <rect x="5" y="11" width="3.5" height="10" rx="1.2" />
      <rect x="23.5" y="11" width="3.5" height="10" rx="1.2" />
      <rect x="9" y="13" width="2.5" height="6" rx="1" />
      <rect x="20.5" y="13" width="2.5" height="6" rx="1" />
      <path d="M11.5 16h9" />
    </>
  ),
  dumbbell: (
    <>
      <rect x="4" y="10" width="4" height="12" rx="1.4" />
      <rect x="24" y="10" width="4" height="12" rx="1.4" />
      <rect x="8.5" y="12.5" width="3" height="7" rx="1" />
      <rect x="20.5" y="12.5" width="3" height="7" rx="1" />
      <path d="M11.5 16h9" />
    </>
  ),
  cable: (
    <>
      <path d="M6 4h20" />
      <path d="M16 4v9" />
      <path d="M11 13h10l-1.5 5h-7z" />
      <path d="M16 18v4" />
      <rect x="10" y="22" width="12" height="4" rx="2" />
    </>
  ),
  machine: (
    <>
      <path d="M6 27V7a3 3 0 0 1 3-3h6" />
      <rect x="15" y="8" width="11" height="7" rx="2" />
      <rect x="15" y="18" width="11" height="7" rx="2" />
      <path d="M6 16h9" />
    </>
  ),
  bodyweight: (
    <>
      <circle cx="16" cy="7" r="3.2" />
      <path d="M16 11v8" />
      <path d="M9 14h14" />
      <path d="M16 19l-4 8M16 19l4 8" />
    </>
  ),
  kettlebell: (
    <>
      <path d="M12 12a4 4 0 0 1 8 0" />
      <path d="M11.5 12c-3 2-4.5 5.5-4.5 9a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3c0-3.5-1.5-7-4.5-9z" />
    </>
  ),
  band: (
    <>
      <path d="M5 6c8 4 14 12 22 20" />
      <path d="M5 6c-1 3 0 5 2 6" />
      <path d="M27 26c1-3 0-5-2-6" />
      <circle cx="16" cy="16" r="2.2" />
    </>
  ),
  plate: (
    <>
      <circle cx="16" cy="16" r="11" />
      <circle cx="16" cy="16" r="3.5" />
      <path d="M16 5v3M16 24v3M5 16h3M24 16h3" />
    </>
  ),
};

/** Group tints, close enough to the Bodygraph's vocabulary to feel like one system. */
const GROUP_TINT: Record<MuscleGroup, string> = {
  chest: 'hsl(var(--primary))',
  back: 'hsl(var(--tier-platinum))',
  shoulders: 'hsl(var(--tier-gold))',
  arms: 'hsl(var(--tier-diamond))',
  core: 'hsl(var(--tier-legend))',
  legs: 'hsl(var(--tier-titan))',
};

export interface EquipmentIconProps {
  equipment: Equipment;
  group?: MuscleGroup;
  size?: number;
  className?: string;
  /** Rounded tinted plate behind the glyph — the list-row treatment. */
  boxed?: boolean;
}

export function EquipmentIcon({
  equipment,
  group,
  size = 28,
  className,
  boxed = false,
}: EquipmentIconProps) {
  const tint = group ? GROUP_TINT[group] : 'currentColor';
  const glyph = (
    <svg
      width={boxed ? size * 0.62 : size}
      height={boxed ? size * 0.62 : size}
      viewBox="0 0 32 32"
      fill="none"
      stroke={tint}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', !boxed && className)}
      role="img"
      aria-label={equipment}
    >
      {GLYPH[equipment]}
    </svg>
  );

  if (!boxed) return glyph;
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-xl border border-border', className)}
      style={{ width: size, height: size, background: `color-mix(in srgb, ${tint} 12%, transparent)` }}
    >
      {glyph}
    </span>
  );
}

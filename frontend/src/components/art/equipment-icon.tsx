'use client';
/**
 * Equipment glyphs — one per equipment type, tinted by the exercise's primary
 * muscle group. This is the exercise-row thumbnail and the picker's filter chip.
 *
 * These are **filled** artwork from game-icons.net (CC BY 3.0), not stroked
 * outlines. The first version was hand-drawn at 2px stroke in a 32×32 box and
 * went spindly and characterless at the 17px these actually render at — solid
 * shapes hold their silhouette all the way down, which is the whole job of an
 * icon this small. See `MEMORY.md §9`: look for the asset before drawing one.
 *
 * The dumbbell is the single exception. game-icons has no dumbbell (checked the
 * whole 4,239-icon index), so it is authored here in the same 512-unit filled
 * idiom rather than dropping in a stroked icon from a second set and breaking
 * the family.
 */
import { GLYPHS, GLYPH_BOX, type GlyphId } from './game-icons';
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

/**
 * Everything but the dumbbell is a vendored glyph. `barbell` reuses the emblem
 * the Unranked badge already carries — it is a barbell being pressed, which is
 * exactly the picture, and a second copy of the same path data buys nothing.
 */
const VENDORED: Partial<Record<Equipment, GlyphId>> = {
  barbell: 'lifting',
  cable: 'pulley',
  machine: 'gears',
  bodyweight: 'strongArms',
  kettlebell: 'weight',
  band: 'coilSpring',
  plate: 'metalDisc',
};

/** Hand-authored, in the vendored glyphs' 512-unit box so the weights match. */
const DUMBBELL = (
  <>
    <rect x="34" y="138" width="62" height="236" rx="22" />
    <rect x="416" y="138" width="62" height="236" rx="22" />
    <rect x="106" y="178" width="40" height="156" rx="14" />
    <rect x="366" y="178" width="40" height="156" rx="14" />
    <rect x="146" y="226" width="220" height="60" rx="12" />
  </>
);

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
  const vendored = VENDORED[equipment];

  const glyph = (
    <svg
      width={boxed ? size * 0.6 : size}
      height={boxed ? size * 0.6 : size}
      viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`}
      fill={tint}
      className={cn('shrink-0', !boxed && className)}
      role="img"
      aria-label={equipment}
    >
      {vendored ? <path d={GLYPHS[vendored].d} /> : DUMBBELL}
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

// ── self-check ────────────────────────────────────────────────────
// A missing glyph renders as an empty box, which looks like a loading state
// rather than a bug — so assert it instead of hoping someone notices.
export const __selfcheck = () => {
  for (const e of EQUIPMENT) {
    if (e === 'dumbbell') continue; // authored above, not vendored
    const id = VENDORED[e];
    if (!id) throw new Error(`${e} has no equipment glyph`);
    if (!GLYPHS[id]?.d) throw new Error(`${e} → missing vendored glyph ${id}`);
  }
  return `${EQUIPMENT.length} equipment glyphs ok`;
};

'use client';
/**
 * Medal — heptagon body with a swappable emblem. Hand-authored SVG.
 * One shape, six emblems, four material tiers: the whole achievement wall is
 * built from this rather than from per-medal artwork.
 */
import { useSvgId } from '@/lib/svg-id';
import { cn } from '@/lib/utils';

export const MEDAL_EMBLEMS = {
  bolt: 'M34 12 L20 32 h8 l-3 14 L40 26 h-8 z',
  flame: 'M30 10 C38 20 44 26 44 34 a14 14 0 0 1 -28 0 c0 -6 4 -10 8 -14 c1 5 4 7 6 8 c-2 -6 -1 -12 0 -18 z',
  dumbbell:
    'M14 24 h4 v12 h-4 z M20 22 h5 v16 h-5 z M27 27 h16 v6 h-16 z M45 22 h5 v16 h-5 z M52 24 h4 v12 h-4 z',
  star: 'M30 10 l6 13 14 2 -10 10 3 14 -13 -7 -13 7 3 -14 -10 -10 14 -2 z',
  crown: 'M14 38 L11 16 l11 8 8 -14 8 14 11 -8 -3 22 z',
  globe:
    'M30 10 a20 20 0 1 0 0.1 0 z M10 30 h40 M30 10 c-8 8 -8 32 0 40 M30 10 c8 8 8 32 0 40',
} as const;

export type MedalEmblem = keyof typeof MEDAL_EMBLEMS;

export const MEDAL_MATERIALS = {
  stone: ['#7C8598', '#39404F'],
  bronze: ['#E09A63', '#93542A'],
  silver: ['#D8DFE6', '#8F9AA6'],
  gold: ['#FBD968', '#D19A16'],
} as const;

export type MedalMaterial = keyof typeof MEDAL_MATERIALS;

const HEPTAGON = 'M32 2 L58 15 L64 43 L46 62 H18 L0 43 L6 15 Z';

export interface MedalProps {
  emblem?: MedalEmblem;
  material?: MedalMaterial;
  size?: number;
  locked?: boolean;
  className?: string;
  label?: string;
}

export function Medal({
  emblem = 'bolt',
  material = 'stone',
  size = 64,
  locked = false,
  className,
  label,
}: MedalProps) {
  const uid = useSvgId();
  const [light, dark] = locked ? ['#4b5261', '#242932'] : MEDAL_MATERIALS[material];
  const outline = MEDAL_EMBLEMS[emblem];
  const strokeOnly = emblem === 'globe';

  return (
    <svg
      width={size}
      height={size}
      viewBox="-2 0 68 64"
      className={cn('shrink-0', className)}
      role="img"
      aria-label={label ?? `${material} ${emblem} medal${locked ? ' (locked)' : ''}`}
    >
      <defs>
        <linearGradient id={`${uid}-m`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="60%" stopColor={dark} />
          <stop offset="100%" stopColor={light} stopOpacity={0.7} />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.45" r="0.55">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.45} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
      </defs>

      <path d={HEPTAGON} fill={`url(#${uid}-m)`} />
      <path d={HEPTAGON} fill={`url(#${uid}-glow)`} />
      <path d={HEPTAGON} fill="none" stroke={light} strokeWidth={1.6} strokeOpacity={locked ? 0.35 : 0.85} />

      <g transform="translate(1 1)">
        <path
          d={outline}
          fill={strokeOnly ? 'none' : '#fff'}
          fillOpacity={locked ? 0.22 : 0.92}
          stroke="#fff"
          strokeOpacity={strokeOnly ? (locked ? 0.22 : 0.9) : 0.15}
          strokeWidth={strokeOnly ? 2.2 : 0.8}
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

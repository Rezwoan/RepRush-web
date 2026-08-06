'use client';
/**
 * Medal — one heptagon body, a swappable emblem, four materials. The whole
 * achievement wall is built from this rather than from per-medal artwork.
 *
 * The emblems are real artwork (game-icons.net, CC BY 3.0 — see `game-icons.ts`);
 * the hand-drawn versions flattened into blobs at 64px. Materials stay
 * programmatic so a medal can be shown locked, or earned, from the same data.
 *
 * Motion is SMIL for the same reason as the rank badge: user-unit values that
 * do not shift when the medal is rendered at 40px instead of 96px.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { useSvgId } from '@/lib/svg-id';
import { useIdleMotion } from '@/lib/use-idle-motion';
import { cn } from '@/lib/utils';
import { GLYPHS, GLYPH_BOX, type GlyphId } from './game-icons';

/** Achievement vocabulary → vendored glyph. Add a key here, not a new drawing. */
export const MEDAL_EMBLEMS = {
  bolt: 'bolt',
  flame: 'flame',
  dumbbell: 'weight',
  star: 'star',
  crown: 'crown',
  globe: 'globe',
  trophy: 'trophy',
  target: 'target',
  streak: 'calendar',
  heart: 'heart',
  meal: 'meal',
  mountain: 'mountain',
  shoe: 'shoe',
  chart: 'chart',
  muscle: 'muscleUp',
} as const satisfies Record<string, GlyphId>;

export type MedalEmblem = keyof typeof MEDAL_EMBLEMS;

export const MEDAL_MATERIALS = {
  stone: ['#7C8598', '#39404F'],
  bronze: ['#E09A63', '#93542A'],
  silver: ['#D8DFE6', '#8F9AA6'],
  gold: ['#FBD968', '#D19A16'],
} as const;

export type MedalMaterial = keyof typeof MEDAL_MATERIALS;

const HEPTAGON = 'M50 6 L82 22 L90 56 L68 82 H32 L10 56 L18 22 Z';
const CX = 50;
const CY = 46;

/** Gold earns the ray halo; everything else would just look busy. */
const HALOED: MedalMaterial[] = ['gold'];
const RAYS = Array.from({ length: 16 }, (_, i) => i * 22.5);

export interface MedalProps {
  emblem?: MedalEmblem;
  material?: MedalMaterial;
  size?: number;
  locked?: boolean;
  /** Idle sheen and halo. Off in dense grids. Always off under reduced motion. */
  animated?: boolean;
  /** Springs in on mount — for the moment one is actually awarded. */
  entrance?: boolean;
  className?: string;
  label?: string;
}

export function Medal({
  emblem = 'bolt',
  material = 'stone',
  size = 64,
  locked = false,
  animated = true,
  entrance = false,
  className,
  label,
}: MedalProps) {
  const uid = useSvgId();
  const reduced = useReducedMotion();
  const [light, dark] = locked ? ['#4b5261', '#242932'] : MEDAL_MATERIALS[material];
  const glyph = GLYPHS[MEDAL_EMBLEMS[emblem]];

  const moves = useIdleMotion(animated && !locked);
  const halo = !locked && size >= 56 && HALOED.includes(material);

  const glyphSize = 48;

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn('shrink-0 overflow-visible', className)}
      role="img"
      aria-label={label ?? `${material} ${emblem} medal${locked ? ' (locked)' : ''}`}
      // See rank-badge: only the transition may depend on reduced motion.
      initial={entrance ? { scale: 0.5, opacity: 0, rotate: -14 } : false}
      animate={entrance ? { scale: 1, opacity: 1, rotate: 0 } : undefined}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 15 }}
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
        <clipPath id={`${uid}-clip`}>
          <path d={HEPTAGON} />
        </clipPath>
      </defs>

      {halo && (
        <g fill={light} opacity={0.3}>
          {RAYS.map((a) => (
            <path key={a} d="M49 0 L51 0 L50.5 14 L49.5 14 Z" transform={`rotate(${a} ${CX} ${CY})`} />
          ))}
          {moves && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`0 ${CX} ${CY}`}
              to={`360 ${CX} ${CY}`}
              dur="30s"
              repeatCount="indefinite"
            />
          )}
        </g>
      )}

      <path d={HEPTAGON} fill={`url(#${uid}-m)`} />
      <path d={HEPTAGON} fill={`url(#${uid}-glow)`} />
      <path
        d={HEPTAGON}
        fill="none"
        stroke={light}
        strokeWidth={2}
        strokeOpacity={locked ? 0.35 : 0.85}
        strokeLinejoin="round"
      />

      <g
        fill="#fff"
        fillOpacity={locked ? 0.22 : 0.94}
        transform={`translate(${CX - glyphSize / 2} ${CY - glyphSize / 2}) scale(${glyphSize / GLYPH_BOX})`}
      >
        <path d={glyph.d} />
      </g>

      {moves && (
        <g clipPath={`url(#${uid}-clip)`}>
          <rect y={-10} width={13} height={120} fill="#fff" opacity={0.28} transform="skewX(-18)">
            <animate attributeName="x" values="-20;110" dur="3.8s" repeatCount="indefinite" />
          </rect>
        </g>
      )}
    </motion.svg>
  );
}

// ── self-check ────────────────────────────────────────────────────
export const __selfcheck = () => {
  for (const [key, id] of Object.entries(MEDAL_EMBLEMS)) {
    if (!GLYPHS[id]?.d) throw new Error(`medal emblem ${key} → missing glyph ${id}`);
  }
  return `${Object.keys(MEDAL_EMBLEMS).length} medal emblems ok`;
};

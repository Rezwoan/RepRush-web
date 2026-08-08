'use client';
/**
 * Rank badge — a hex crest per tier, with divisions, a locked state, and enough
 * motion that the ladder feels like something you climb rather than a static
 * icon set.
 *
 * The emblems are real artwork (game-icons.net, CC BY 3.0 — see `game-icons.ts`)
 * rather than hand-drawn glyphs, and each tier gets its own so the escalation
 * reads at a glance: you lift → you flex → you're crowned → you're an Olympian.
 *
 * All motion is SMIL inside the SVG, not CSS. The badge is drawn in user units
 * and rendered at anything from 24px to 120px; CSS percentage transforms
 * resolve against a box that changes with it, SMIL values do not. It also means
 * one element, no keyframe registry, and nothing to tree-shake.
 *
 * The tinting stays programmatic (8 tiers × 3 divisions × locked = 48 states),
 * which is exactly why a fixed-colour Lottie/Rive pack was rejected: see
 * `MEMORY.md §9`.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { useSvgId } from '@/lib/svg-id';
import { useIdleMotion } from '@/lib/use-idle-motion';
import { cn } from '@/lib/utils';
import { GLYPHS, GLYPH_BOX, type GlyphId } from './game-icons';
import {
  ROMAN,
  TIERS,
  TIER_GRADIENT,
  TIER_LABEL,
  divisionsIn,
  rankLabel,
  type Division,
  type Rank,
  type Tier,
} from '@/lib/ranks';

/**
 * Vertical hexagon crest. Everything else is positioned against this, and the
 * whole composition — halo, wings, sparks, division ribbon — is kept inside the
 * 100×100 box so the badge occupies exactly the space it is given. Ornaments
 * that spill turn the row below into overlapping mush.
 */
const HEX = 'M50 8 L76 23 V57 L50 78 L24 57 V23 Z';
const CX = 50;
const CY = 42;
/** Division plate, hung across the crest's lower point. */
const RIBBON = 'M35 67 H65 L60 83 H40 Z';

const SIZES = { xs: 24, sm: 34, md: 48, lg: 72, xl: 120 } as const;
export type BadgeSize = keyof typeof SIZES;

/** One emblem per tier — the ladder should be legible without reading the label. */
const TIER_GLYPH: Record<Tier, GlyphId> = {
  unranked: 'lifting',
  bronze: 'muscleUp',
  silver: 'biceps',
  gold: 'laurels',
  platinum: 'crystal',
  diamond: 'cutDiamond',
  champion: 'crown',
  titan: 'thorFist',
  olympian: 'wingedEmblem',
};

/** Tiers from Diamond up get wings; it should be obvious when someone is high. */
const WING_FROM = TIERS.indexOf('diamond');
/** Gold and up get orbiting sparks. */
const SPARK_FROM = TIERS.indexOf('gold');
/** Platinum and up get the rotating ray halo. */
const RAY_FROM = TIERS.indexOf('platinum');

const RAYS = Array.from({ length: 12 }, (_, i) => i * 30);
const SPARKS = [0, 120, 240];

export interface RankBadgeProps {
  tier: Tier;
  division?: Division;
  size?: BadgeSize;
  /** Greyed out with a dimmed emblem — for unearned gallery entries. */
  locked?: boolean;
  /**
   * Idle motion: sheen, orbiting sparks, ray halo, breathing aura.
   * On by default; pass `false` for long lists, where 40 animating badges is
   * noise and a repaint bill. Always off under `prefers-reduced-motion`.
   */
  animated?: boolean;
  /** Springs in on mount. For hero placements and promotion moments. */
  entrance?: boolean;
  showDivision?: boolean;
  className?: string;
}

export function RankBadge({
  tier,
  division,
  size = 'md',
  locked = false,
  animated = true,
  entrance = false,
  showDivision = true,
  className,
}: RankBadgeProps) {
  const uid = useSvgId();
  const reduced = useReducedMotion();
  const px = SIZES[size];
  const [light, dark] = locked ? ['#4b5261', '#2a2f3a'] : TIER_GRADIENT[tier];
  const rank = TIERS.indexOf(tier);
  // Olympian is a single band — printing a division on it would invent a rank.
  const divided = showDivision && !!division && divisionsIn(tier) > 1 && tier !== 'unranked';
  const label = divided ? `${TIER_LABEL[tier]} ${ROMAN[division!]}` : TIER_LABEL[tier];

  const moves = useIdleMotion(animated && !locked);
  // Ornaments cost paint and stop reading below ~64px, where the badge is a
  // list bullet rather than a subject.
  const rich = px >= SIZES.lg && !locked;
  const winged = rich && rank >= WING_FROM;
  const sparks = rich && rank >= SPARK_FROM;
  const rays = rich && rank >= RAY_FROM;

  const glyph = GLYPHS[TIER_GLYPH[tier]];
  const glyphSize = 38;
  const glyphScale = glyphSize / GLYPH_BOX;
  const wingSize = 78;

  return (
    <motion.svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      className={cn('shrink-0 overflow-visible', className)}
      role="img"
      aria-label={locked ? `${label} (locked)` : label}
      // `reduced` may only reach the transition: initial/animate become inline
      // styles in the server HTML, and branching those on a media query the
      // server cannot read is a hydration mismatch.
      initial={entrance ? { scale: 0.6, opacity: 0, rotate: -12 } : false}
      animate={entrance ? { scale: 1, opacity: 1, rotate: 0 } : undefined}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 16 }}
    >
      <defs>
        <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={dark} />
          <stop offset="100%" stopColor={light} stopOpacity={0.75} />
        </linearGradient>
        <linearGradient id={`${uid}-bevel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.55} />
          <stop offset="45%" stopColor="#fff" stopOpacity={0.05} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.3} />
        </linearGradient>
        <radialGradient id={`${uid}-aura`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="45%" stopColor={light} stopOpacity={0.45} />
          <stop offset="100%" stopColor={light} stopOpacity={0} />
        </radialGradient>
        <clipPath id={`${uid}-clip`}>
          <path d={HEX} />
        </clipPath>
      </defs>

      {/* Halo — breathing glow, then the spinning spokes behind the crest. */}
      {rich && (
        <circle cx={CX} cy={CY} r={42} fill={`url(#${uid}-aura)`} opacity={0.7}>
          {moves && (
            <animate
              attributeName="opacity"
              values="0.45;0.85;0.45"
              dur="3.2s"
              repeatCount="indefinite"
            />
          )}
        </circle>
      )}

      {rays && (
        <g fill={light} opacity={0.35}>
          {RAYS.map((a) => (
            <path
              key={a}
              d="M49 1 L51 1 L50.6 17 L49.4 17 Z"
              transform={`rotate(${a} ${CX} ${CY})`}
            />
          ))}
          {moves && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`0 ${CX} ${CY}`}
              to={`360 ${CX} ${CY}`}
              dur="24s"
              repeatCount="indefinite"
            />
          )}
        </g>
      )}

      {winged && (
        <g
          fill={dark}
          opacity={0.85}
          transform={`translate(${CX - wingSize / 2} ${CY - wingSize / 2}) scale(${wingSize / GLYPH_BOX})`}
        >
          <path d={GLYPHS.angelWings.d} />
        </g>
      )}

      {/* Crest */}
      <path d={HEX} fill={`url(#${uid}-metal)`} />
      <path d={HEX} fill={`url(#${uid}-bevel)`} />
      <path
        d={HEX}
        fill="none"
        stroke={light}
        strokeWidth={2}
        strokeOpacity={locked ? 0.4 : 0.9}
        strokeLinejoin="round"
      />
      {/* Inner rim: reads as depth at 48px where a bevel gradient alone does not. */}
      <path
        d={HEX}
        fill="none"
        stroke="#fff"
        strokeOpacity={locked ? 0.08 : 0.22}
        strokeWidth={1}
        transform={`translate(${CX * 0.16} ${CY * 0.16}) scale(0.84)`}
      />

      <g
        fill="#fff"
        fillOpacity={locked ? 0.25 : 0.94}
        transform={`translate(${CX - glyphSize / 2} ${CY - glyphSize / 2}) scale(${glyphScale})`}
      >
        <path d={glyph.d} />
      </g>

      {/* Sheen sweeps across the crest, not the ornaments. */}
      {moves && (
        <g clipPath={`url(#${uid}-clip)`}>
          <rect y={-10} width={12} height={120} fill="#fff" opacity={0.3} transform="skewX(-18)">
            <animate attributeName="x" values="-20;110" dur="3.4s" repeatCount="indefinite" />
          </rect>
        </g>
      )}

      {sparks && (
        <g>
          {SPARKS.map((a) => (
            <circle key={a} cx={CX} cy={CY - 38} r={2.2} fill={light} transform={`rotate(${a} ${CX} ${CY})`}>
              {moves && (
                <animate
                  attributeName="r"
                  values="1.4;2.8;1.4"
                  dur="1.8s"
                  begin={`${a / 360}s`}
                  repeatCount="indefinite"
                />
              )}
            </circle>
          ))}
          {moves && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`360 ${CX} ${CY}`}
              to={`0 ${CX} ${CY}`}
              dur="9s"
              repeatCount="indefinite"
            />
          )}
        </g>
      )}

      {divided && px >= SIZES.md && (
        <g>
          {/* Two fills: the tier's dark metal, then black, because III over a
              pale tier (silver, legend) is otherwise unreadable at 48px. */}
          <path d={RIBBON} fill={dark} />
          <path d={RIBBON} fill="#000" fillOpacity={0.45} />
          <path
            d={RIBBON}
            fill="none"
            stroke={light}
            strokeWidth={1.2}
            strokeOpacity={locked ? 0.4 : 0.9}
          />
          <text
            x={CX}
            y={79.5}
            textAnchor="middle"
            fontSize={10}
            fontWeight={800}
            letterSpacing={0.4}
            fill="#fff"
            fillOpacity={locked ? 0.45 : 1}
          >
            {ROMAN[division!]}
          </text>
        </g>
      )}
    </motion.svg>
  );
}

/** Badge + label, the form used in lists and headers. Still by default. */
export function RankChip({
  rank,
  size = 'sm',
  animated = false,
  className,
}: {
  rank: Rank | null | undefined;
  size?: BadgeSize;
  animated?: boolean;
  className?: string;
}) {
  const tier = rank?.tier ?? 'unranked';
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <RankBadge
        tier={tier}
        division={rank?.division}
        size={size}
        animated={animated}
        showDivision={false}
      />
      <span className="text-sm font-bold" style={{ color: `hsl(var(--tier-${tier}))` }}>
        {rankLabel(rank)}
      </span>
    </span>
  );
}

// ── self-check ────────────────────────────────────────────────────
// Every tier must resolve to a glyph that actually exists, or a rank-up lands
// on an empty crest.
export const __selfcheck = () => {
  for (const t of TIERS) {
    const g = GLYPHS[TIER_GLYPH[t]];
    if (!g?.d) throw new Error(`${t} has no emblem`);
  }
  if (!GLYPHS.angelWings?.d) throw new Error('wing ornament missing');

  // The ornaments are positioned by hand against CY, and the winged tiers once
  // hung 13 units past the bottom of the viewBox and painted over the label
  // underneath. Extents, not eyeballs.
  const extents: Record<string, [number, number]> = {
    crest: [8, 78],
    aura: [CY - 42, CY + 42],
    wings: [CY - 39, CY + 39],
    sparks: [CY - 40.2, CY + 40.2],
    ribbon: [67, 83],
  };
  for (const [name, [top, bottom]] of Object.entries(extents)) {
    if (top < 0 || bottom > 100) throw new Error(`${name} escapes the viewBox (${top}…${bottom})`);
  }
  return `${TIERS.length} tier emblems ok, ornaments inside the box`;
};

'use client';
/**
 * Rank badge — hex shield, one per tier, with I/II/III and a locked state.
 * Hand-authored SVG. The emblem is RepRush's own lightning bolt (from the
 * logo), which is what keeps this from looking like every other ladder badge.
 */
import { useSvgId } from '@/lib/svg-id';
import { cn } from '@/lib/utils';
import { ROMAN, TIER_GRADIENT, TIER_LABEL, rankLabel, type Division, type Rank, type Tier } from '@/lib/ranks';

const HEX = 'M32 3 L56 17 L56 45 L32 59 L8 45 L8 17 Z';
const BOLT = 'M35.5 17 L23 34 h8.5 l-3 12 L41 29 h-8.5 z';
/** Swept wings that flank the top tiers — earned visual weight, not decoration. */
const WING_L = 'M8 22 C0 24 -2 30 1 35 L8 31 Z';
const WING_R = 'M56 22 C64 24 66 30 63 35 L56 31 Z';

const SIZES = { xs: 24, sm: 34, md: 48, lg: 72, xl: 120 } as const;
export type BadgeSize = keyof typeof SIZES;

/** Tiers from Diamond up get wings; it should be obvious when someone is high. */
const WINGED: Tier[] = ['diamond', 'titan', 'legend'];

export interface RankBadgeProps {
  tier: Tier;
  division?: Division;
  size?: BadgeSize;
  /** Greyed out with a reduced-opacity emblem — for unearned gallery entries. */
  locked?: boolean;
  /** Animated sheen. Reserve for the hero badge; it is noisy in a list. */
  shine?: boolean;
  showDivision?: boolean;
  className?: string;
}

export function RankBadge({
  tier,
  division,
  size = 'md',
  locked = false,
  shine = false,
  showDivision = true,
  className,
}: RankBadgeProps) {
  const uid = useSvgId();
  const px = SIZES[size];
  const [light, dark] = locked ? ['#4b5261', '#2a2f3a'] : TIER_GRADIENT[tier];
  const winged = WINGED.includes(tier) && !locked;
  const label = division ? `${TIER_LABEL[tier]} ${ROMAN[division]}` : TIER_LABEL[tier];

  return (
    <svg
      width={px}
      height={px}
      viewBox="-6 0 76 62"
      className={cn('shrink-0 overflow-visible', className)}
      role="img"
      aria-label={locked ? `${label} (locked)` : label}
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
        <clipPath id={`${uid}-clip`}>
          <path d={HEX} />
        </clipPath>
      </defs>

      {winged && (
        <g fill={dark} opacity={0.9}>
          <path d={WING_L} />
          <path d={WING_R} />
        </g>
      )}

      <path d={HEX} fill={`url(#${uid}-metal)`} />
      <path d={HEX} fill={`url(#${uid}-bevel)`} />
      <path d={HEX} fill="none" stroke={light} strokeWidth={1.5} strokeOpacity={locked ? 0.4 : 0.9} />

      <path
        d={BOLT}
        fill="#fff"
        fillOpacity={locked ? 0.25 : 0.92}
        stroke="#000"
        strokeOpacity={0.12}
        strokeWidth={0.6}
      />

      {shine && !locked && (
        <g clipPath={`url(#${uid}-clip)`}>
          <rect x={-30} y={0} width={16} height={62} fill="#fff" opacity={0.35} className="animate-sheen" />
        </g>
      )}

      {showDivision && division && tier !== 'unranked' && px >= SIZES.md && (
        <text
          x={32}
          y={54}
          textAnchor="middle"
          fontSize={11}
          fontWeight={800}
          fill="#fff"
          fillOpacity={locked ? 0.4 : 0.95}
          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.35)', strokeWidth: 2 }}
        >
          {ROMAN[division]}
        </text>
      )}
    </svg>
  );
}

/** Badge + label, the form used in lists and headers. */
export function RankChip({
  rank,
  size = 'sm',
  className,
}: {
  rank: Rank | null | undefined;
  size?: BadgeSize;
  className?: string;
}) {
  const tier = rank?.tier ?? 'unranked';
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <RankBadge tier={tier} division={rank?.division} size={size} showDivision={false} />
      <span className="text-sm font-bold" style={{ color: `hsl(var(--tier-${tier}))` }}>
        {rankLabel(rank)}
      </span>
    </span>
  );
}

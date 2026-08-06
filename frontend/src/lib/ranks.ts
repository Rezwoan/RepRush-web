/**
 * Rank vocabulary — the display side of the ladder.
 *
 * The scoring engine (e1RM → percentile → tier) lives server-side in P3;
 * this file is only about naming, ordering and colouring what it returns,
 * so the client never invents ranks of its own.
 */

export const TIERS = [
  'unranked',
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'titan',
  'legend',
] as const;

export type Tier = (typeof TIERS)[number];

/** Divisions run III → II → I, i.e. I is the *best* within a tier (LoL convention). */
export type Division = 1 | 2 | 3;

export interface Rank {
  tier: Tier;
  division: Division;
  /** 0–100 within the current division. */
  lp: number;
}

export const TIER_LABEL: Record<Tier, string> = {
  unranked: 'Unranked',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
  titan: 'Titan',
  legend: 'Legend',
};

/** Matches the --tier-* variables in globals.css. */
export const TIER_VAR: Record<Tier, string> = Object.fromEntries(
  TIERS.map((t) => [t, `hsl(var(--tier-${t}))`]),
) as Record<Tier, string>;

/** Light/dark pair used for the badge's metal gradient. */
export const TIER_GRADIENT: Record<Tier, [string, string]> = {
  unranked: ['#6b7280', '#3f4652'],
  bronze: ['#E09A63', '#93542A'],
  silver: ['#D8DFE6', '#8F9AA6'],
  gold: ['#FBD968', '#D19A16'],
  platinum: ['#7FEBD0', '#25A98A'],
  diamond: ['#B9BAFB', '#6E70E0'],
  titan: ['#F4756F', '#B31E1E'],
  legend: ['#9BE3FF', '#2F9BD6'],
};

export const ROMAN: Record<Division, string> = { 1: 'I', 2: 'II', 3: 'III' };

/** "Gold II" — or just "Unranked", which has no divisions. */
export function rankLabel(r: Rank | null | undefined): string {
  if (!r || r.tier === 'unranked') return TIER_LABEL.unranked;
  return `${TIER_LABEL[r.tier]} ${ROMAN[r.division]}`;
}

/** Monotonic score for sorting and for "is this a promotion?" comparisons. */
export function rankValue(r: Rank | null | undefined): number {
  if (!r) return 0;
  const t = TIERS.indexOf(r.tier);
  // Division 3 is the entry point of a tier, division 1 the top of it.
  return t * 300 + (3 - r.division) * 100 + Math.max(0, Math.min(100, r.lp));
}

export const isPromotion = (from: Rank | null, to: Rank | null) => rankValue(to) > rankValue(from);

/** Tier crossed, not just LP gained — the moment worth a full-screen celebration. */
export const isTierUp = (from: Rank | null, to: Rank | null) =>
  TIERS.indexOf(to?.tier ?? 'unranked') > TIERS.indexOf(from?.tier ?? 'unranked');

// ── self-check ────────────────────────────────────────────────────
export const __selfcheck = () => {
  const r = (tier: Tier, division: Division, lp = 0): Rank => ({ tier, division, lp });

  // Ordering within a tier: III < II < I
  if (!(rankValue(r('gold', 3)) < rankValue(r('gold', 2)))) throw new Error('III should rank below II');
  if (!(rankValue(r('gold', 2)) < rankValue(r('gold', 1)))) throw new Error('II should rank below I');
  // Top of one tier is still below the bottom of the next.
  if (!(rankValue(r('gold', 1, 100)) < rankValue(r('platinum', 3, 0))))
    throw new Error('tier boundary is not monotonic');
  // Unranked is the floor.
  if (rankValue(r('unranked', 3)) !== 0) throw new Error('unranked should score 0');

  if (!isTierUp(r('silver', 1, 99), r('gold', 3, 0))) throw new Error('silver I → gold III is a tier up');
  if (isTierUp(r('gold', 3), r('gold', 1))) throw new Error('same tier is not a tier up');
  if (!isPromotion(r('gold', 3), r('gold', 1))) throw new Error('gold III → I is a promotion');

  if (rankLabel(r('unranked', 1)) !== 'Unranked') throw new Error('unranked has no division');
  if (rankLabel(r('platinum', 2)) !== 'Platinum II') throw new Error('bad label');
  return 'ranks ok';
};

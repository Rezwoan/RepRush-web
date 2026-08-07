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
  'champion',
  'titan',
  'olympian',
] as const;

export type Tier = (typeof TIERS)[number];

/** Divisions ascend I → II → III, i.e. III is the *best* within a tier. */
export type Division = 1 | 2 | 3;

/** Olympian is the apex and has no divisions; it is always reported as I. */
export const divisionsIn = (tier: Tier) => (tier === 'olympian' ? 1 : 3);

export interface Rank {
  tier: Tier;
  division: Division;
  /** 0–100 within the current division. */
  lp: number;
  /** 0–100 population percentile the tier was derived from. Always sent by the API. */
  percentile: number;
}

export const TIER_LABEL: Record<Tier, string> = {
  unranked: 'Unranked',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
  champion: 'Champion',
  titan: 'Titan',
  olympian: 'Olympian',
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
  champion: ['#F79BE0', '#C2379B'],
  titan: ['#F4756F', '#B31E1E'],
  olympian: ['#DFF6FF', '#4FB6E8'],
};

export const ROMAN: Record<Division, string> = { 1: 'I', 2: 'II', 3: 'III' };

/** "Gold II" — or just "Olympian" / "Unranked", which have no divisions. */
export function rankLabel(r: Rank | null | undefined): string {
  if (!r || r.tier === 'unranked') return TIER_LABEL.unranked;
  if (divisionsIn(r.tier) === 1) return TIER_LABEL[r.tier];
  return `${TIER_LABEL[r.tier]} ${ROMAN[r.division]}`;
}

/**
 * Strictly monotonic score for sorting and "is this a promotion?" comparisons.
 *
 * The spans must be *wider* than the value they contain, or the top of one band
 * collides with the bottom of the next: with a 100-wide division span, Gold I at
 * 100 LP and Platinum III at 0 LP both score 1200, and a real promotion compares
 * as "no change". Hence 101 per division and 303 per tier.
 */
const LP_MAX = 100;
const DIVISION_SPAN = LP_MAX + 1;
const TIER_SPAN = DIVISION_SPAN * 3;

export function rankValue(r: { tier: Tier; division: Division; lp: number } | null | undefined): number {
  if (!r) return 0;
  const t = TIERS.indexOf(r.tier);
  if (t <= 0) return 0; // unranked (and anything unrecognised) is the floor
  // Division I is the entry point of a tier, division III the top of it.
  return t * TIER_SPAN + (r.division - 1) * DIVISION_SPAN + Math.max(0, Math.min(LP_MAX, r.lp));
}

export const isPromotion = (from: Rank | null, to: Rank | null) => rankValue(to) > rankValue(from);

/** Tier crossed, not just LP gained — the moment worth a full-screen celebration. */
export const isTierUp = (from: Rank | null, to: Rank | null) =>
  TIERS.indexOf(to?.tier ?? 'unranked') > TIERS.indexOf(from?.tier ?? 'unranked');

// ── self-check ────────────────────────────────────────────────────
export const __selfcheck = () => {
  const r = (tier: Tier, division: Division, lp = 0): Rank => ({ tier, division, lp, percentile: 0 });

  // Ordering within a tier: I < II < III
  if (!(rankValue(r('gold', 1)) < rankValue(r('gold', 2)))) throw new Error('I should rank below II');
  if (!(rankValue(r('gold', 2)) < rankValue(r('gold', 3)))) throw new Error('II should rank below III');
  // Top of one band must sit strictly below the bottom of the next — both at
  // the division boundary and at the tier boundary. This is the case that was
  // actually wrong: a full-LP promotion compared as "no change".
  if (!(rankValue(r('gold', 2, 100)) < rankValue(r('gold', 3, 0))))
    throw new Error('division boundary is not monotonic');
  if (!(rankValue(r('gold', 3, 100)) < rankValue(r('platinum', 1, 0))))
    throw new Error('tier boundary is not monotonic');
  if (!isPromotion(r('gold', 3, 100), r('platinum', 1, 0)))
    throw new Error('gold III full LP → platinum I must read as a promotion');
  // The apex is one band and must out-score every Titan.
  if (!(rankValue(r('titan', 3, 100)) < rankValue(r('olympian', 1, 0))))
    throw new Error('Olympian must sit above Titan III');
  // Unranked is the floor.
  if (rankValue(r('unranked', 1)) !== 0) throw new Error('unranked should score 0');

  if (!isTierUp(r('silver', 3, 99), r('gold', 1, 0))) throw new Error('silver III → gold I is a tier up');
  if (isTierUp(r('gold', 1), r('gold', 3))) throw new Error('same tier is not a tier up');
  if (!isPromotion(r('gold', 1), r('gold', 3))) throw new Error('gold I → III is a promotion');

  if (rankLabel(r('unranked', 1)) !== 'Unranked') throw new Error('unranked has no division');
  if (rankLabel(r('olympian', 1)) !== 'Olympian') throw new Error('the apex has no division');
  if (rankLabel(r('platinum', 2)) !== 'Platinum II') throw new Error('bad label');
  // Every tier needs a colour pair and a label, or a rank-up renders blank.
  for (const t of TIERS) {
    if (!TIER_GRADIENT[t] || !TIER_LABEL[t]) throw new Error(`${t} has no gradient or label`);
  }
  return 'ranks ok';
};

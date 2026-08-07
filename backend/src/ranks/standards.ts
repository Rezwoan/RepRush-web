/**
 * Strength standards — the bit that turns a number on a bar into a rank.
 *
 * The chain, per SPEC §6:
 *
 *   e1RM → ratio (e1RM / bodyweight, adjusted for age)
 *        → percentile (against a log-normal population curve for that exercise)
 *        → tier + division + LP
 *
 * It is a handful of coefficients, deliberately, not a 900-row dataset. A
 * dataset would need maintaining and would still be wrong for the long tail;
 * a three-factor model plus a short override list is right where it matters and
 * merely plausible elsewhere.
 *
 * `ponytail:` the derived path is `BASE[primary muscle] × mechanic × equipment`.
 * When a specific lift ranks obviously wrong, add one line to OVERRIDES rather
 * than bending a factor and breaking twenty other exercises.
 */

// ── the ladder (mirrors frontend/src/lib/ranks.ts) ─────────────────
// Eight names and one arithmetic rule, mirrored rather than generated: it is
// less machinery than a codegen step, and `__selfcheck` pins the ordering.

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
export type Division = 1 | 2 | 3;

export interface Rank {
  tier: Tier;
  division: Division;
  lp: number;
  /** 0–100, what the tier was derived from. Kept so the UI can say "stronger than 55%". */
  percentile: number;
}

const LP_MAX = 100;
const DIVISION_SPAN = LP_MAX + 1; // wider than the value it holds, or bands collide
const TIER_SPAN = DIVISION_SPAN * 3;

/** Strictly monotonic score for sorting and promotion comparisons. */
export function rankValue(r: { tier: Tier; division: Division; lp: number } | null | undefined): number {
  if (!r) return 0;
  const t = TIERS.indexOf(r.tier);
  if (t <= 0) return 0;
  return t * TIER_SPAN + (3 - r.division) * DIVISION_SPAN + Math.max(0, Math.min(LP_MAX, r.lp));
}

export const UNRANKED: Rank = { tier: 'unranked', division: 3, lp: 0, percentile: 0 };

/**
 * Percentile at which each tier begins. Deliberately not linear: strength is
 * clustered, so most people should see Bronze–Gold and the top tiers should be
 * rare enough to mean something. Gold III is the median gym-goer.
 */
const TIER_FLOOR: [Tier, number][] = [
  ['bronze', 0],
  ['silver', 25],
  ['gold', 45],
  ['platinum', 65],
  ['diamond', 80],
  ['titan', 91],
  ['legend', 97.5],
];

export function rankFromPercentile(percentile: number): Rank {
  const p = Math.max(0, Math.min(100, percentile));
  let i = TIER_FLOOR.length - 1;
  while (i > 0 && p < TIER_FLOOR[i][1]) i--;
  const [tier, lo] = TIER_FLOOR[i];
  const hi = i + 1 < TIER_FLOOR.length ? TIER_FLOOR[i + 1][1] : 100;

  // Position within the tier, split into three divisions. III is the entry.
  const t = hi > lo ? (p - lo) / (hi - lo) : 0;
  const step = Math.min(2, Math.floor(t * 3));
  return {
    tier,
    division: (3 - step) as Division,
    lp: Math.round(Math.max(0, Math.min(LP_MAX, (t * 3 - step) * 100))),
    percentile: Math.round(p * 10) / 10,
  };
}

// ── the population curve ──────────────────────────────────────────

/**
 * Standard normal CDF (Abramowitz & Stegun 7.1.26). Accurate to ~1.5e-7, which
 * is several orders of magnitude better than the coefficients feeding it.
 */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Spread of log-strength in the training population. 0.32 puts roughly a 1.5×
 * gap between the 15th and 85th percentile on any given lift, which matches how
 * gyms actually look.
 */
const LOG_SIGMA = 0.32;

/** Where a bodyweight-multiple lands on the population curve for a lift with this median. */
export function percentileFor(ratio: number, median: number): number {
  if (!(ratio > 0) || !(median > 0)) return 0;
  return normalCdf(Math.log(ratio / median) / LOG_SIGMA) * 100;
}

/**
 * Inverse standard normal CDF — Acklam's rational approximation, |ε| < 1.15e-9.
 *
 * Needed because the app has to answer the question in the other direction:
 * SPEC §5.2's rank strip names *the set that promotes you* (`82.5x3`), which
 * means turning a target percentile back into a load. A search over
 * `percentileFor` would do it too, but this is closed-form and exact enough.
 */
function normalInv(p: number): number {
  if (!(p > 0) || !(p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const lo = 0.02425;

  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** The bodyweight multiple that lands exactly on this percentile. Inverse of `percentileFor`. */
export function ratioForPercentile(percentile: number, median: number): number {
  if (!(median > 0)) return 0;
  const p = Math.max(0.05, Math.min(99.95, percentile)) / 100;
  return median * Math.exp(LOG_SIGMA * normalInv(p));
}

/**
 * The percentile at which the *next* division begins, or null at the top.
 *
 * Divisions are the tier band split in three, so the boundaries are the two
 * thirds inside the current tier and then the next tier's floor. Derived from
 * TIER_FLOOR rather than listed, so it cannot drift from `rankFromPercentile`.
 */
export function nextDivisionPercentile(percentile: number): number | null {
  const p = Math.max(0, Math.min(100, percentile));
  let i = TIER_FLOOR.length - 1;
  while (i > 0 && p < TIER_FLOOR[i][1]) i--;
  const top = i + 1 >= TIER_FLOOR.length;
  const lo = TIER_FLOOR[i][1];
  const hi = top ? 100 : TIER_FLOOR[i + 1][1];
  // The third edge *is* the next tier's floor — a real boundary everywhere
  // except the top tier, where it is just the end of the scale.
  for (const step of top ? [1, 2] : [1, 2, 3]) {
    const edge = lo + ((hi - lo) * step) / 3;
    if (edge > p + 1e-9) return Math.min(edge, 100);
  }
  return null; // already in the top division of the top tier
}

// ── the coefficients ──────────────────────────────────────────────

/**
 * Median male e1RM as a multiple of bodyweight, for a *barbell compound* lift
 * on that muscle. Everything else is derived from these by the two factors below.
 */
const BASE: Record<string, number> = {
  neck: 0.25,
  traps: 1.1,
  front_delt: 0.6,
  side_delt: 0.7,
  rear_delt: 0.7,
  upper_chest: 0.85,
  mid_chest: 1.0,
  lower_chest: 1.05,
  biceps: 1.1, // the compound baseline is a chin-up, not a curl
  triceps: 0.85,
  forearms: 0.6,
  lats: 1.1,
  upper_back: 0.9,
  lower_back: 1.6,
  abs: 0.5,
  obliques: 0.45,
  glutes: 1.6,
  quads: 1.35,
  hamstrings: 1.2,
  adductors: 0.7,
  calves: 1.5,
};

/**
 * Isolation work scores against a fraction of the muscle's compound baseline —
 * but *how much* of a fraction depends on the equipment.
 *
 * A machine or cable stack is not a free-weight load: the machine supports the
 * body, the leverage is chosen to be favourable, and the number on the stack
 * usually overstates what reaches the muscle. Discounting a pec deck as hard as
 * a dumbbell fly is what made real users' machine work come out Legend on the
 * first pass through actual training history.
 */
function mechanicFactor(mechanic: string | null, equipment: string): number {
  if (mechanic !== 'isolation') return mechanic === 'compound' ? 1 : 0.7;
  return equipment === 'machine' || equipment === 'cable' ? 0.75 : 0.4;
}

/** Dumbbells are logged per hand, which is most of why that number is so low. */
const EQUIPMENT: Record<string, number> = {
  barbell: 1,
  machine: 1.05,
  cable: 0.85,
  dumbbell: 0.45,
  kettlebell: 0.35,
  band: 0.25,
  plate: 0.3,
  bodyweight: 1,
};

/**
 * Fraction of bodyweight a bodyweight movement actually loads.
 *
 * Without this every calisthenics exercise ranks Legend: a crunch would be
 * scored as if the athlete had lifted their entire mass. Keyed by primary
 * muscle because that is what distinguishes a pull-up (all of you) from a
 * push-up (about two thirds) from a crunch (about a third).
 */
const BODYWEIGHT_FRACTION: Record<string, number> = {
  lats: 1,
  biceps: 1,
  upper_back: 1,
  lower_chest: 0.95,
  calves: 0.9,
  quads: 0.8,
  glutes: 0.7,
  triceps: 0.7,
  mid_chest: 0.65,
  upper_chest: 0.65,
  front_delt: 0.6,
  hamstrings: 0.6,
  traps: 0.6,
  forearms: 0.5,
  adductors: 0.5,
  lower_back: 0.45,
  side_delt: 0.4,
  rear_delt: 0.4,
  abs: 0.35,
  obliques: 0.35,
  neck: 0.3,
};

/**
 * Lifts people actually rank on, set directly rather than derived. These are the
 * ones where being wrong is most visible, so they skip the model entirely.
 *
 * **These are median *e1RM* multiples, not median working weights.** Someone
 * curling 35 kg for 8 has an e1RM of 44, so the curl coefficient is 0.52 at an
 * 80 kg bodyweight, not 0.44. Getting this backwards makes an exercise rank one
 * or two tiers too high, which is how the first draft had lateral raises paying
 * out Titan. Dumbbell figures are per hand, because that is what gets logged.
 */
const OVERRIDES: Record<string, number> = {
  'Barbell_Bench_Press_-_Medium_Grip': 1.0,
  Barbell_Squat: 1.35,
  Barbell_Deadlift: 1.6,
  Standing_Military_Press: 0.6,
  'Bent_Over_Barbell_Row': 0.9,
  'Wide-Grip_Lat_Pulldown': 0.8,
  'V-Bar_Pulldown': 0.85,
  Barbell_Curl: 0.52,
  'Close-Grip_Barbell_Bench_Press': 0.85,
  Romanian_Deadlift: 1.2,
  Leg_Press: 2.3,
  Hack_Squat: 1.2,
  'Front_Barbell_Squat': 1.05,
  Leg_Extensions: 0.9,
  Lying_Leg_Curls: 0.8,
  Seated_Leg_Curl: 0.85,
  Standing_Calf_Raises: 1.65,
  Seated_Calf_Raise: 1.0,
  Incline_Dumbbell_Press: 0.42,
  Dumbbell_Bench_Press: 0.47,
  Seated_Dumbbell_Press: 0.33,
  Side_Lateral_Raise: 0.175,
  'Triceps_Pushdown_-_Rope_Attachment': 0.48,
  'EZ-Bar_Skullcrusher': 0.45,
  Hammer_Curls: 0.25,
};

/** For the boot check that every override actually names a catalog exercise. */
export const overrideIds = () => Object.keys(OVERRIDES);

/** For the boot check that every muscle in the taxonomy has a standard to be scored against. */
export const baseMuscleIds = () => Object.keys(BASE);

/** Female medians relative to male, by muscle group. Upper body differs most. */
const FEMALE_FACTOR: Record<string, number> = {
  chest: 0.6,
  arms: 0.6,
  shoulders: 0.6,
  back: 0.65,
  core: 0.65,
  legs: 0.72,
};

export interface ExerciseShape {
  id: string;
  primary: string[];
  equipment: string;
  mechanic: 'compound' | 'isolation' | null;
}

/**
 * Median performance on a bodyweight movement, expressed the same way as
 * everything else: an e1RM as a multiple of bodyweight.
 *
 * These can't go through the model above. The load on a push-up is fixed — you
 * cannot add 5 kg to it — so the population spread lives entirely in the rep
 * count, and applying an `isolation` discount on top of the bodyweight fraction
 * discounts it twice. (That is exactly what the self-check caught: a crunch
 * scored the 100th percentile.) So the median is the fraction of bodyweight the
 * movement loads, times the reps a median trainee gets: about four for a
 * pull-up, more than the 12-rep cap for a crunch.
 *
 * The cap is doing real work here — past 12 reps every performance scores the
 * same, which is the honest answer for a crunch. Easy bodyweight movements
 * simply do not tell you how strong someone is.
 */
function bodyweightMedian(muscle: string): number {
  const fraction = BODYWEIGHT_FRACTION[muscle] ?? 0.6;
  const medianReps = Math.min(12, 4 + 30 * (1 - fraction));
  return fraction * (1 + medianReps / 30);
}

/** The bodyweight multiple a median lifter of this sex hits on this exercise. */
export function medianRatio(ex: ExerciseShape, sex: string | null, muscleGroup: string | null): number {
  const muscle = ex.primary[0];
  const male =
    OVERRIDES[ex.id] ??
    (ex.equipment === 'bodyweight'
      ? bodyweightMedian(muscle)
      : (BASE[muscle] ?? 0.6) * mechanicFactor(ex.mechanic, ex.equipment) * (EQUIPMENT[ex.equipment] ?? 1));
  if (sex !== 'female') return male;
  return male * (FEMALE_FACTOR[muscleGroup ?? ''] ?? 0.65);
}

/** How much of the athlete's own mass an exercise puts through the target muscle. */
export const bodyweightFraction = (primaryMuscle: string) => BODYWEIGHT_FRACTION[primaryMuscle] ?? 0.6;

/**
 * Age handicap, applied to the athlete's ratio before it meets the curve.
 *
 * The standards describe a lifter in their prime. A 55-year-old matching a
 * 28-year-old is the stronger athlete and the ladder should say so; the same
 * goes, more gently, for a 16-year-old.
 */
export function ageFactor(age: number | null): number {
  if (!age || age < 10 || age > 100) return 1;
  if (age < 23) return Math.min(1.1, 1 + 0.01 * (23 - age));
  if (age <= 33) return 1;
  return Math.min(1.45, 1 + 0.007 * (age - 33));
}

// ── self-check ────────────────────────────────────────────────────
export const __selfcheck = () => {
  const fail = (m: string) => {
    throw new Error(m);
  };

  // The ladder must stay strictly ordered across every boundary — this is the
  // bug that already bit once on the frontend.
  const rv = (tier: Tier, division: Division, lp: number) => rankValue({ tier, division, lp });
  if (!(rv('gold', 3, 100) < rv('gold', 2, 0))) fail('division boundary is not monotonic');
  if (!(rv('gold', 1, 100) < rv('platinum', 3, 0))) fail('tier boundary is not monotonic');
  if (rv('unranked', 3, 0) !== 0) fail('unranked should score 0');

  // percentile → rank must be monotonic across its whole range, and land in the
  // documented tiers at the documented percentiles.
  let prev = -1;
  for (let p = 0; p <= 100; p += 0.5) {
    const v = rankValue(rankFromPercentile(p));
    if (v < prev) fail(`rankFromPercentile is not monotonic at p=${p}`);
    prev = v;
  }
  if (rankFromPercentile(0).tier !== 'bronze') fail('the floor is Bronze, not Unranked');
  if (rankFromPercentile(0).division !== 3) fail('the floor is division III');
  if (rankFromPercentile(50).tier !== 'gold') fail('the median lifter should be Gold');
  if (rankFromPercentile(99).tier !== 'legend') fail('99th percentile should be Legend');
  if (rankFromPercentile(100).division !== 1) fail('the top of the ladder is division I');

  // The curve: median in, 50th out; symmetric; monotonic.
  if (Math.abs(percentileFor(1, 1) - 50) > 0.1) fail('median ratio must be the 50th percentile');
  if (!(percentileFor(1.5, 1) > percentileFor(1.2, 1))) fail('percentile must rise with ratio');
  if (!(percentileFor(0.5, 1) < 50)) fail('below median must be below the 50th percentile');
  if (percentileFor(5, 1) > 100 || percentileFor(0.01, 1) < 0) fail('percentile escaped 0–100');
  if (percentileFor(0, 1) !== 0) fail('a zero ratio has no percentile');

  // Anchor: SPEC's worked example — 100 kg × 5 bench at 82 kg, male, 25.
  const bench: ExerciseShape = {
    id: 'Barbell_Bench_Press_-_Medium_Grip',
    primary: ['mid_chest'],
    equipment: 'barbell',
    mechanic: 'compound',
  };
  const benchRatio = (100 * (1 + 5 / 30)) / 82;
  const benchRank = rankFromPercentile(percentileFor(benchRatio * ageFactor(25), medianRatio(bench, 'male', 'chest')));
  if (benchRank.tier !== 'diamond') fail(`100kg x5 @82kg should be Diamond, got ${benchRank.tier}`);

  // The same lift by a woman of the same mass is a rarer feat and must rank higher.
  const female = rankFromPercentile(percentileFor(benchRatio, medianRatio(bench, 'female', 'chest')));
  if (!(rankValue(female) > rankValue(benchRank))) fail('female standards must be scaled, not shared');

  // Bodyweight movements. Unlimited crunches must not out-rank a heavy squat,
  // and a pull-up must still be worth something — the two failure modes the
  // bodyweight branch exists to sit between. Crunches were scoring the 100th
  // percentile before it existed.
  const bwRatio = (ex: ExerciseShape, reps: number, addedKg = 0, bw = 80) =>
    ((bw * bodyweightFraction(ex.primary[0]) + addedKg) * (1 + Math.min(reps, 12) / 30)) / bw;

  const crunch: ExerciseShape = { id: 'Crunches', primary: ['abs'], equipment: 'bodyweight', mechanic: 'isolation' };
  const crunchP = percentileFor(bwRatio(crunch, 30), medianRatio(crunch, 'male', 'core'));
  if (crunchP > 60) fail(`unlimited crunches scored the ${crunchP.toFixed(0)}th percentile`);

  const pullup: ExerciseShape = { id: 'Pullups', primary: ['lats'], equipment: 'bodyweight', mechanic: 'compound' };
  const p1 = percentileFor(bwRatio(pullup, 1), medianRatio(pullup, 'male', 'back'));
  const p8 = percentileFor(bwRatio(pullup, 8), medianRatio(pullup, 'male', 'back'));
  const p8weighted = percentileFor(bwRatio(pullup, 8, 20), medianRatio(pullup, 'male', 'back'));
  if (!(p1 < p8 && p8 < p8weighted)) fail('pull-ups must reward reps, then added weight');
  if (!(p8 > 55 && p8 < 85)) fail(`8 strict pull-ups scored the ${p8.toFixed(0)}th percentile`);
  if (rankFromPercentile(p8).tier === 'legend') fail('8 pull-ups is not Legend');

  // Machine and cable isolation. A 60 kg × 8 pec deck is an ordinary set in an
  // ordinary gym; the first pass through real training history had it, and
  // every other machine movement, paying out Legend, because a stack number was
  // being discounted as hard as a dumbbell fly.
  const pecDeck: ExerciseShape = { id: 'Butterfly', primary: ['mid_chest'], equipment: 'machine', mechanic: 'isolation' };
  const pecP = percentileFor((60 * (1 + 8 / 30)) / 82, medianRatio(pecDeck, 'male', 'chest'));
  if (pecP > 80) fail(`a 60kg x8 pec deck scored the ${pecP.toFixed(0)}th percentile`);

  const cableExt: ExerciseShape = {
    id: 'Cable_Rope_Overhead_Triceps_Extension',
    primary: ['triceps'],
    equipment: 'cable',
    mechanic: 'isolation',
  };
  const cableP = percentileFor((40 * (1 + 8 / 30)) / 82, medianRatio(cableExt, 'male', 'arms'));
  if (cableP > 80) fail(`a 40kg x8 overhead cable extension scored the ${cableP.toFixed(0)}th percentile`);

  // ...but a machine must not become worthless either: the same movement at
  // twice the load has to clear the one above it comfortably.
  if (!(percentileFor((120 * (1 + 8 / 30)) / 82, medianRatio(pecDeck, 'male', 'chest')) > pecP + 20)) {
    fail('doubling the load on a machine barely moved the percentile');
  }

  // The curve must invert. This is what the rank strip's "beat 82.5x3" is built
  // on, so a wrong inverse would print a prescription that does not promote you.
  for (const p of [1, 12.5, 31, 50, 69.5, 86.5, 96.2, 99]) {
    const back = percentileFor(ratioForPercentile(p, 1.0), 1.0);
    if (Math.abs(back - p) > 0.01) fail(`ratioForPercentile did not round-trip at p=${p} (got ${back})`);
  }
  if (!(ratioForPercentile(80, 1) > ratioForPercentile(50, 1))) fail('the inverse must be increasing');
  if (Math.abs(ratioForPercentile(50, 1.35) - 1.35) > 1e-6) fail('the median percentile is the median ratio');

  // Every step up the ladder must be reachable and strictly ahead of where you
  // stand — a boundary that returns the percentile you already have would make
  // the rank strip say "beat what you just did".
  let cursor = 0;
  let steps = 0;
  while (true) {
    const next = nextDivisionPercentile(cursor);
    if (next === null) break;
    if (!(next > cursor)) fail(`nextDivisionPercentile went backwards at ${cursor}`);
    // Every boundary must be a real band edge — the rank a hair above it must
    // differ from the rank a hair below. Comparing rankValue alone is too weak:
    // LP rises inside a division, so a non-boundary would sail through, which
    // is how the rank strip came to promise the division the user already held.
    const below = rankFromPercentile(next - 1e-6);
    const above = rankFromPercentile(next + 1e-6);
    if (below.tier === above.tier && below.division === above.division)
      fail(`${next} is not a division boundary (${below.tier} ${below.division} on both sides)`);
    if (rankValue(above) <= rankValue(rankFromPercentile(cursor)))
      fail(`crossing ${next} from ${cursor} is not a promotion`);
    cursor = next;
    if (++steps > 100) fail('nextDivisionPercentile does not terminate');
  }
  // 7 tiers x 3 divisions = 21 bands, so 20 boundaries from the very bottom.
  if (steps !== 20) fail(`expected 20 division boundaries, walked ${steps}`);
  if (nextDivisionPercentile(100) !== null) fail('the top of the ladder has nothing above it');

  // Age: monotonic upward past the prime, flat through it, never below 1.
  if (ageFactor(28) !== 1) fail('the prime is not handicapped');
  if (!(ageFactor(55) > ageFactor(45) && ageFactor(45) > ageFactor(35))) fail('age credit must increase');
  if (!(ageFactor(16) > 1)) fail('under-23s get a small allowance');
  if (ageFactor(null) !== 1 || ageFactor(0) !== 1) fail('unknown age must be neutral');

  // Every muscle the catalog can emit needs a base and a bodyweight fraction,
  // or its exercises silently fall back to a guess.
  for (const m of Object.keys(BASE)) {
    if (!(m in BODYWEIGHT_FRACTION)) fail(`${m} has no bodyweight fraction`);
  }
  for (const [id, v] of Object.entries(OVERRIDES)) {
    if (!(v > 0 && v < 5)) fail(`override ${id} = ${v} is out of range`);
  }

  return 'standards ok';
};

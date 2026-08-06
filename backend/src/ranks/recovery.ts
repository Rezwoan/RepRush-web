/**
 * Recovery model (SPEC §10) — how fatigued each muscle is right now.
 *
 * Lives beside `e1rm.ts` and `standards.ts` because it is the same kind of
 * thing: pure per-muscle maths over a user's sets, with no Nest wiring. The
 * Home tab's Recovery Zone reads it, and P6's workout generator will too.
 *
 * **Fatigue is counted in hard sets, not kilograms.** That is the deliberate
 * choice here. Kilograms are not comparable across muscles — 100 kg × 5 on a
 * squat and 20 kg × 10 on a lateral raise are similar amounts of work for the
 * muscle involved and wildly different numbers — so any volume-based model
 * needs a per-exercise normaliser, which is exactly the thing that would have
 * to be tuned for 873 exercises. A set is the unit training is actually
 * programmed in, and it needs no normalising.
 *
 * ponytail: the intensity factors below are literature-shaped rather than
 * measured, because there is nothing to measure them against yet. When enough
 * sessions exist to correlate self-reported readiness against predicted
 * fatigue, `HALF_LIFE_*` and `CAPACITY_*` are the two knobs to fit; the shape
 * of the model does not need to change for that.
 */

/** A muscle recovers over this long, scaled by its size (SPEC §10: 48h–72h). */
const HALF_LIFE_MIN_H = 48;
const HALF_LIFE_MAX_H = 72;

/** Decayed set-units a muscle can carry before it reads as fully cooked. */
const CAPACITY_MIN = 8;
const CAPACITY_MAX = 16;

/** A set trains its secondary muscles, but not as hard. */
const SECONDARY_SHARE = 0.5;

/** Above this readiness the app says train; below the lower bound, rest. */
const READY_ABOVE = 0.7;
const RECOVERING_ABOVE = 0.45;

/** A muscle counts as fresh enough to be worth naming in the copy. */
export const FRESH_BELOW = 0.35;

export type RecoveryStatus = 'ready' | 'recovering' | 'rest';

export interface FatigueSet {
  /** Muscle ids the set trains directly. */
  primary: string[];
  secondary: string[];
  reps: number;
  /** 1–10 if the user logged it; null for everything imported from v1. */
  rpe: number | null;
  /** How long ago the set was logged. */
  ageHours: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** size 1 → 48h, size 5 → 72h. Big muscles take longer. */
export const halfLifeHours = (size: number) =>
  HALF_LIFE_MIN_H + ((clamp(size, 1, 5) - 1) / 4) * (HALF_LIFE_MAX_H - HALF_LIFE_MIN_H);

/** size 1 → 8 units, size 5 → 16. Big muscles also tolerate more. */
export const capacity = (size: number) =>
  CAPACITY_MIN + ((clamp(size, 1, 5) - 1) / 4) * (CAPACITY_MAX - CAPACITY_MIN);

/**
 * Local fatigue per set, before decay.
 *
 * Longer sets fatigue the muscle more than heavy triples do (the systemic cost
 * of a heavy single is real, but it is not *this* muscle's recovery), and a set
 * taken closer to failure costs more. RPE 8 is the neutral point because that
 * is what a working set is assumed to be when nobody logged one.
 */
export const setUnits = (reps: number, rpe: number | null) => {
  const repFactor = clamp(0.6 + reps / 20, 0.6, 1.25);
  const rpeFactor = rpe == null ? 1 : clamp(0.5 + rpe / 16, 0.6, 1.2);
  return repFactor * rpeFactor;
};

export const decayFactor = (ageHours: number, size: number) =>
  Math.pow(0.5, Math.max(0, ageHours) / halfLifeHours(size));

export interface MuscleFatigue {
  muscleId: string;
  /** 0 = fully recovered, 1 = fully fatigued. */
  fatigue: number;
  /** Decayed set-units currently carried. */
  units: number;
}

/**
 * Fatigue for every muscle in `sizes`, from a user's recent sets.
 * Muscles with no recent work come back at 0 — absence is recovery.
 */
export function fatigueByMuscle(
  sets: FatigueSet[],
  sizes: Record<string, number>,
): Record<string, MuscleFatigue> {
  const units: Record<string, number> = {};
  for (const id of Object.keys(sizes)) units[id] = 0;

  for (const s of sets) {
    const base = setUnits(s.reps, s.rpe);
    const add = (id: string, share: number) => {
      const size = sizes[id];
      if (size === undefined) return; // a muscle the taxonomy doesn't have
      units[id] += base * share * decayFactor(s.ageHours, size);
    };
    for (const id of s.primary) add(id, 1);
    for (const id of s.secondary) add(id, SECONDARY_SHARE);
  }

  const out: Record<string, MuscleFatigue> = {};
  for (const [id, size] of Object.entries(sizes)) {
    out[id] = {
      muscleId: id,
      units: Math.round(units[id] * 100) / 100,
      fatigue: clamp(units[id] / capacity(size), 0, 1),
    };
  }
  return out;
}

/** Whole-body readiness, 0–1, weighted by muscle size. */
export function readinessOf(
  fatigue: Record<string, MuscleFatigue>,
  sizes: Record<string, number>,
): number {
  let weighted = 0;
  let total = 0;
  for (const [id, size] of Object.entries(sizes)) {
    weighted += (fatigue[id]?.fatigue ?? 0) * size;
    total += size;
  }
  return total ? clamp(1 - weighted / total, 0, 1) : 1;
}

export const statusOf = (readiness: number): RecoveryStatus =>
  readiness >= READY_ABOVE ? 'ready' : readiness >= RECOVERING_ABOVE ? 'recovering' : 'rest';

// ── self-check ──────────────────────────────────────────────────────
// Run at boot by RanksService, alongside the e1rm and standards checks. A
// silently wrong recovery model sends people to train a muscle they trashed
// yesterday, which is worse than a service that refuses to start.

export const __selfcheck = () => {
  const fail = (m: string) => {
    throw new Error(`recovery: ${m}`);
  };

  // Half-life and capacity both rise with size, and stay inside the SPEC range.
  if (halfLifeHours(1) !== HALF_LIFE_MIN_H || halfLifeHours(5) !== HALF_LIFE_MAX_H)
    fail('half-life should span 48h–72h across sizes 1–5');
  if (!(halfLifeHours(2) < halfLifeHours(4))) fail('half-life must rise with muscle size');
  if (!(capacity(2) < capacity(4))) fail('capacity must rise with muscle size');
  // Out-of-range sizes must clamp rather than extrapolate to nonsense.
  if (halfLifeHours(99) !== HALF_LIFE_MAX_H || halfLifeHours(0) !== HALF_LIFE_MIN_H)
    fail('size outside 1–5 must clamp');

  // One half-life must halve the contribution. This is the whole decay model.
  const hl = halfLifeHours(3);
  if (Math.abs(decayFactor(hl, 3) - 0.5) > 1e-9) fail('one half-life should decay to exactly 0.5');
  if (decayFactor(0, 3) !== 1) fail('a set logged just now has not decayed');
  if (!(decayFactor(hl * 4, 3) < 0.07)) fail('four half-lives should be nearly gone');

  // Longer sets and harder sets cost more; a missing RPE is neutral, not zero.
  if (!(setUnits(12, null) > setUnits(3, null))) fail('a set of 12 should cost more than a triple');
  if (!(setUnits(8, 10) > setUnits(8, 6))) fail('closer to failure should cost more');
  if (setUnits(8, null) !== setUnits(8, 8)) fail('a missing RPE should read as a working set (8)');
  if (setUnits(50, null) > 1.3) fail('rep factor must stay capped');

  const sizes = { quads: 5, biceps: 2, calves: 2 };
  const set = (primary: string[], secondary: string[], ageHours: number): FatigueSet => ({
    primary,
    secondary,
    reps: 8,
    rpe: null,
    ageHours,
  });

  // Untrained muscles are recovered, and a rested user is ready.
  const idle = fatigueByMuscle([], sizes);
  if (idle.quads.fatigue !== 0) fail('a muscle with no sets should carry no fatigue');
  if (readinessOf(idle, sizes) !== 1) fail('no training at all should read as fully ready');
  if (statusOf(readinessOf(idle, sizes)) !== 'ready') fail('a rested user should be told to train');

  // A hard session today cooks what it trained, and leaves the rest alone.
  const today = fatigueByMuscle(
    Array.from({ length: 12 }, () => set(['quads'], ['calves'], 1)),
    sizes,
  );
  if (!(today.quads.fatigue > 0.8)) fail('12 sets an hour ago should read as heavily fatigued');
  if (today.biceps.fatigue !== 0) fail('a muscle that was not trained must not accumulate fatigue');
  if (!(today.calves.fatigue > 0 && today.calves.fatigue < today.quads.fatigue))
    fail('secondary muscles should take some fatigue, but less than primaries');

  // ...and a week later it is gone. This is what makes the Bodygraph honest.
  const lastWeek = fatigueByMuscle(
    Array.from({ length: 12 }, () => set(['quads'], ['calves'], 24 * 7)),
    sizes,
  );
  if (!(lastWeek.quads.fatigue < 0.15)) fail('a week of rest should clear a hard session');
  if (!(readinessOf(lastWeek, sizes) > READY_ABOVE)) fail('a week of rest should read as ready');

  // Fatigue saturates rather than running away — the Bodygraph tints on 0–1.
  const absurd = fatigueByMuscle(
    Array.from({ length: 400 }, () => set(['quads'], [], 0)),
    sizes,
  );
  if (absurd.quads.fatigue !== 1) fail('fatigue must clamp at 1');
  if (readinessOf(absurd, sizes) < 0) fail('readiness must not go negative');

  // Status thresholds must be ordered, or the copy contradicts the gauge.
  if (statusOf(1) !== 'ready' || statusOf(0.5) !== 'recovering' || statusOf(0) !== 'rest')
    fail('status thresholds are out of order');

  // An unknown muscle id must be ignored, not crash or create a phantom entry.
  const stray = fatigueByMuscle([set(['not_a_muscle'], [], 1)], sizes);
  if (Object.keys(stray).length !== Object.keys(sizes).length)
    fail('an unknown muscle id must not appear in the output');

  return 'recovery ok';
};

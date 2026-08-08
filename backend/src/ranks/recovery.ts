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
 * fatigue, `HALF_LIFE_*` and `TYPICAL_SESSION_LOAD` are the knobs to fit; the
 * shape of the model does not need to change for that.
 */

/** A muscle recovers over this long, scaled by its size (SPEC §10: 48h–72h). */
const HALF_LIFE_MIN_H = 48;
const HALF_LIFE_MAX_H = 72;

/** What "a normal session for one muscle" means to the calibration below. */
const TYPICAL_SETS = 6;

/** A normal session should leave a muscle this far toward fully cooked. */
const TYPICAL_SESSION_LOAD = 0.6;

/**
 * Decayed set-units a muscle carries when it reads as fully cooked.
 *
 * **Not scaled by muscle size, deliberately.** A hard set is a hard set for
 * whichever muscle is doing it; what differs between a quad and a bicep is how
 * long the fatigue lasts, and that is already the half-life. The first draft
 * scaled capacity too, which bought nothing and put the two calibration targets
 * on a knife edge — six sets of curls landed *exactly* on the fresh threshold
 * one half-life later, and the boot check failed on the boundary twice.
 *
 * Derived rather than picked, so the two things the model promises stay true by
 * construction: a normal session leaves the muscle not fresh, and one half-life
 * later it is fresh again.
 */
const CAPACITY = TYPICAL_SETS / TYPICAL_SESSION_LOAD;

/** A set trains its secondary muscles, but not as hard. */
const SECONDARY_SHARE = 0.5;

/** Above this readiness the app says train; below the lower bound, rest. */
const READY_ABOVE = 0.7;
const RECOVERING_ABOVE = 0.45;

/** A muscle counts as fresh enough to train and to name in the copy. */
export const FRESH_BELOW = 0.4;

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
      fatigue: clamp(units[id] / CAPACITY, 0, 1),
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

  // Half-life rises with size and stays inside the SPEC range.
  if (halfLifeHours(1) !== HALF_LIFE_MIN_H || halfLifeHours(5) !== HALF_LIFE_MAX_H)
    fail('half-life should span 48h–72h across sizes 1–5');
  if (!(halfLifeHours(2) < halfLifeHours(4))) fail('half-life must rise with muscle size');
  // Capacity is derived, not picked: the two promises below must hold by
  // construction, not by luck.
  if (TYPICAL_SETS / CAPACITY !== TYPICAL_SESSION_LOAD) fail('capacity is not derived from its target');
  if (!(TYPICAL_SESSION_LOAD >= FRESH_BELOW)) fail('a normal session must leave a muscle non-fresh');
  if (!(TYPICAL_SESSION_LOAD / 2 < FRESH_BELOW))
    fail('a normal session must be fresh again one half-life later');
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

  // Proportions mirror the real 21-muscle taxonomy (total size ~55), so the
  // whole-body readiness assertions mean what they say. In a three-muscle
  // fixture one leg session is 5/9 of the body and everything reads as a rest
  // day, which is a property of the fixture rather than of the model.
  const sizes = { quads: 5, biceps: 2, calves: 2, rest: 46 };
  const set = (primary: string[], secondary: string[], ageHours: number): FatigueSet => ({
    primary,
    secondary,
    reps: 8,
    rpe: null,
    ageHours,
  });
  const session = (muscle: string, sets: number, ageHours: number, sec: string[] = []) =>
    fatigueByMuscle(
      Array.from({ length: sets }, () => set([muscle], sec, ageHours)),
      sizes,
    );

  // Untrained muscles are recovered, and a rested user is ready.
  const idle = fatigueByMuscle([], sizes);
  if (idle.quads.fatigue !== 0) fail('a muscle with no sets should carry no fatigue');
  if (readinessOf(idle, sizes) !== 1) fail('no training at all should read as fully ready');
  if (statusOf(readinessOf(idle, sizes)) !== 'ready') fail('a rested user should be told to train');

  // ── The two properties the whole model is calibrated to ──────────
  // These are what a user actually feels, so they are asserted for the biggest
  // and the smallest muscle rather than for one convenient case.
  for (const [muscle, size] of Object.entries(sizes)) {
    const justTrained = session(muscle, TYPICAL_SETS, 1)[muscle].fatigue;
    if (justTrained < FRESH_BELOW)
      fail(
        `${TYPICAL_SETS} sets an hour ago left ${muscle} reading fresh (${justTrained.toFixed(2)}) — ` +
          'the app would offer it again immediately',
      );
    const recovered = session(muscle, TYPICAL_SETS, halfLifeHours(size))[muscle].fatigue;
    if (recovered >= FRESH_BELOW)
      fail(`${muscle} should be fresh again one half-life after a normal session`);
  }

  // A hard session cooks what it trained and leaves everything else alone.
  const legDay = session('quads', 12, 1, ['calves']);
  if (!(legDay.quads.fatigue > 0.9)) fail('12 sets an hour ago should read as nearly saturated');
  if (legDay.biceps.fatigue !== 0) fail('a muscle that was not trained must not accumulate fatigue');
  if (!(legDay.calves.fatigue > 0 && legDay.calves.fatigue < legDay.quads.fatigue))
    fail('secondary muscles should take some fatigue, but less than primaries');

  // ...and a week later it is gone. This is what makes the Bodygraph honest.
  const lastWeek = session('quads', 12, 24 * 7, ['calves']);
  if (!(lastWeek.quads.fatigue < FRESH_BELOW)) fail('a week of rest should clear a hard session');
  if (!(readinessOf(lastWeek, sizes) > READY_ABOVE)) fail('a week of rest should read as ready');

  // Training one muscle group must not make the whole body read as spent —
  // "train legs tomorrow" is the correct answer to a chest session.
  if (statusOf(readinessOf(session('quads', 12, 1), sizes)) !== 'ready')
    fail('one hard muscle should leave the rest of the body available');
  // But training everything hard must.
  const everything = fatigueByMuscle(
    Object.keys(sizes).flatMap((m) => Array.from({ length: 12 }, () => set([m], [], 1))),
    sizes,
  );
  if (statusOf(readinessOf(everything, sizes)) !== 'rest')
    fail('a full-body hammering should read as a rest day');

  // Fatigue saturates rather than running away — the Bodygraph tints on 0–1.
  const absurd = session('quads', 400, 0);
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

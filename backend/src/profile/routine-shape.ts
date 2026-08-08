/**
 * What a routine stores, and the one place that decides it.
 *
 * A routine exercise used to be `{ sets: 3, repMin, repMax, restSec }` — a set
 * *count* plus one rep range shared by every set. That cannot express a working
 * routine: a top set of 3 under two back-offs of 8 is the normal shape of a
 * heavy day, and there was no way to write it down. So a routine now carries an
 * **array of set rows**, each with its own weight and reps, which is also what
 * the tracker logs and what the session screen renders.
 *
 * `null` is meaningful in a row: it means "not prescribed", and the tracker
 * fills the field from the user's last performance instead (the v1 ghost-value
 * rule — a lookup, never a prediction). A routine that names 3 sets and no
 * numbers is a legitimate and common thing to write.
 *
 * `normaliseExercise` accepts the old shape as well and expands it, so a routine
 * saved before this change — every claimed package day — opens correctly and is
 * migrated the next time it is written.
 */

export interface RoutineSet {
  /** Prescribed working weight in kg, or null for "whatever you did last time". */
  weightKg: number | null;
  reps: number | null;
}

export interface RoutineExercise {
  exerciseId: string;
  name: string;
  /** Free text shown above the set grid ("Add Exercise Notes…"). */
  notes: string | null;
  restSec: number;
  sets: RoutineSet[];
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

/** Weight keeps 2dp: imperial input converts to kg and 135 lb is 61.23 kg. */
const clampWeight = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Math.min(n, 1000) * 100) / 100;
};

const clampReps = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, 1000);
};

/**
 * Normalise one exercise from whatever is stored or posted.
 *
 * `isKnown` decides whether the exercise id names something real — the catalog
 * or one of the user's own. Returns null for anything unusable, so one bad row
 * cannot fail a whole save.
 */
export function normaliseExercise(
  raw: any,
  isKnown: (id: string) => boolean,
  nameFor: (id: string) => string | undefined,
  defaultRestFor: (id: string) => number | undefined,
): RoutineExercise | null {
  const exerciseId = typeof raw?.exerciseId === 'string' ? raw.exerciseId : '';
  if (!exerciseId || !isKnown(exerciseId)) return null;

  let sets: RoutineSet[];
  if (Array.isArray(raw?.sets)) {
    sets = raw.sets
      .slice(0, 20)
      .map((s: any) => ({ weightKg: clampWeight(s?.weightKg), reps: clampReps(s?.reps) }));
  } else {
    // ── legacy: a count plus a rep range. Expand it. ──
    // The midpoint rather than either end: "5–8" written as 5 reads as a
    // prescription to do the fewest, and as 8 to always hit the top.
    const count = clampInt(raw?.sets, 1, 20, 3);
    const repMin = clampInt(raw?.repMin, 1, 1000, 8);
    const repMax = Math.max(repMin, clampInt(raw?.repMax, 1, 1000, Math.max(repMin, 12)));
    const reps = Math.round((repMin + repMax) / 2);
    sets = Array.from({ length: count }, () => ({ weightKg: null, reps }));
  }

  if (!sets.length) sets = [{ weightKg: null, reps: null }];

  const notes = typeof raw?.notes === 'string' ? raw.notes.trim().slice(0, 300) : '';

  return {
    exerciseId,
    name: nameFor(exerciseId) ?? String(raw?.name ?? exerciseId).slice(0, 80),
    notes: notes || null,
    restSec: clampInt(raw?.restSec, 0, 600, defaultRestFor(exerciseId) ?? 90),
    sets,
  };
}

/** Parse a stored `routines.exercises` blob into the current shape. */
export function parseExercises(
  raw: string | null | undefined,
  isKnown: (id: string) => boolean,
  nameFor: (id: string) => string | undefined,
  defaultRestFor: (id: string) => number | undefined,
): RoutineExercise[] {
  let list: unknown[] = [];
  try {
    const v = JSON.parse(raw || '[]');
    list = Array.isArray(v) ? v : [];
  } catch {
    list = [];
  }
  return list
    .map((r) => normaliseExercise(r, isKnown, nameFor, defaultRestFor))
    .filter(Boolean) as RoutineExercise[];
}

export const __selfcheck = () => {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error(`routine-shape: ${m}`);
  };
  const known = () => true;
  const name = () => 'Bench Press';
  const rest = () => 90;

  // Legacy expansion: 3 sets of 5–8 becomes three rows of 7 (the midpoint,
  // rounded), with no weight — nothing in the old shape said what to lift.
  const legacy = normaliseExercise(
    { exerciseId: 'x', sets: 3, repMin: 5, repMax: 8, restSec: 180 },
    known,
    name,
    rest,
  );
  assert(legacy!.sets.length === 3, 'legacy count expands to that many rows');
  assert(legacy!.sets.every((s) => s.reps === 7), 'legacy rep range collapses to its midpoint');
  assert(legacy!.sets.every((s) => s.weightKg === null), 'legacy rows carry no weight');
  assert(legacy!.restSec === 180, 'legacy rest survives');

  // Per-set rows: each keeps its own numbers. This is the case the old shape
  // could not express at all.
  const modern = normaliseExercise(
    { exerciseId: 'x', sets: [{ weightKg: 60, reps: 8 }, { weightKg: 80, reps: 3 }] },
    known,
    name,
    rest,
  );
  assert(modern!.sets.length === 2, 'two rows stay two rows');
  assert(modern!.sets[0].weightKg === 60 && modern!.sets[1].reps === 3, 'rows keep their own numbers');

  // Blank rows are legitimate — "3 sets, numbers from last time".
  const blank = normaliseExercise({ exerciseId: 'x', sets: [{}, {}] }, known, name, rest);
  assert(blank!.sets.length === 2 && blank!.sets[0].reps === null, 'a blank row stays blank');

  // Junk is clamped, not trusted.
  const junk = normaliseExercise(
    { exerciseId: 'x', sets: [{ weightKg: -5, reps: 0 }, { weightKg: 1e9, reps: 1e9 }], restSec: -1 },
    known,
    name,
    rest,
  );
  assert(junk!.sets[0].weightKg === null && junk!.sets[0].reps === null, 'negatives become null');
  assert(junk!.sets[1].weightKg === 1000 && junk!.sets[1].reps === 1000, 'absurd values clamp');
  assert(junk!.restSec === 0, 'negative rest clamps to zero');

  // An exercise that no longer resolves is dropped rather than saved as a row
  // that would hand someone an empty tracker.
  assert(normaliseExercise({ exerciseId: 'gone' }, () => false, name, rest) === null, 'unknown id drops');
  assert(normaliseExercise({}, known, name, rest) === null, 'missing id drops');

  // An exercise with no rows at all still gets one, or the editor renders a
  // card with nothing in it and no way to add.
  assert(normaliseExercise({ exerciseId: 'x', sets: [] }, known, name, rest)!.sets.length === 1, 'empty gets one row');

  return 'routine shape ok';
};

/**
 * The workout generator (SPEC §5.1).
 *
 * Pure maths over data the caller supplies, in the same style as `e1rm.ts`,
 * `standards.ts` and `recovery.ts` — no Nest wiring, so it can be self-checked
 * at boot without a database.
 *
 * The rule the whole thing implements, in one sentence: **train what is
 * recovered and lowest-ranked, with what you can actually reach, in the time
 * you have.** Everything below is that sentence made specific.
 */

import { FRESH_BELOW } from '../ranks/recovery';

// ── shapes the caller supplies ────────────────────────────────────

export interface GenExercise {
  id: string;
  name: string;
  primary: string[];
  secondary: string[];
  equipment: string;
  level: 'beginner' | 'intermediate' | 'expert';
  mechanic: 'compound' | 'isolation' | null;
  /** free-exercise-db's category: strength, powerlifting, stretching, cardio… */
  category: string;
  repMin: number;
  repMax: number;
  restSec: number;
}

export interface GenMuscle {
  id: string;
  label: string;
  group: string;
  size: number;
}

/** What the user did last time on an exercise — a lookup, never a prediction. */
export interface LastPerformance {
  weightKg: number;
  reps: number;
  sets: number;
}

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface GenInput {
  muscles: GenMuscle[];
  /** 0–1 per muscle id. Missing means fully recovered. */
  fatigue: Record<string, number>;
  /** Rank percentile per muscle id, 0–100. Missing (or 0) means never trained. */
  percentile: Record<string, number>;
  catalog: GenExercise[];
  /** Equipment ids the user can reach. Null or empty means assume everything. */
  equipment: string[] | null;
  limitations: string[];
  durationMin: number;
  difficulty: Difficulty;
  /** Exercise id → last performance, for the pre-filled numbers. */
  history: Record<string, LastPerformance>;
  /**
   * Working weight to suggest for an exercise the user has never done, from the
   * strength standards for their current rank. Return null to leave it blank —
   * a blank field is honest, an invented number is not.
   */
  estimate: (ex: GenExercise, reps: number) => number | null;
  /** Only these muscle ids, if the user picked a split by hand. */
  onlyMuscles?: string[];
}

export interface PlannedSet {
  setNumber: number;
  isWarmup: boolean;
  targetReps: number;
  /** Pre-filled load. Null when there is nothing honest to put there. */
  weightKg: number | null;
}

export interface PlannedExercise {
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  mechanic: 'compound' | 'isolation' | null;
  restSec: number;
  sets: PlannedSet[];
  /** True when the numbers came from the user's own last session. */
  fromHistory: boolean;
}

export interface GeneratedWorkout {
  title: string;
  durationMin: number;
  estimatedSec: number;
  focus: { muscleId: string; label: string; share: number }[];
  exercises: PlannedExercise[];
}

// ── constants ─────────────────────────────────────────────────────

/** Seconds a working set takes, doorway to doorway, excluding rest. */
const WORK_SEC = 45;

/** Walking to the next station, adjusting the seat, loading the bar. */
const TRANSITION_SEC = 60;

/** Warm-up sets are short and unrested; they still cost some of the budget. */
const WARMUP_SEC = 40;

/** Sets per exercise. Harder training is more sets, not different exercises. */
const SETS_BY_DIFFICULTY: Record<Difficulty, number> = {
  beginner: 2,
  intermediate: 3,
  advanced: 4,
};

/** Levels a difficulty is willing to prescribe. */
const LEVELS_BY_DIFFICULTY: Record<Difficulty, GenExercise['level'][]> = {
  beginner: ['beginner'],
  intermediate: ['beginner', 'intermediate'],
  advanced: ['beginner', 'intermediate', 'expert'],
};

/** Roughly one muscle per this many minutes, so a short session stays focused. */
const MIN_PER_MUSCLE = 15;
const MIN_MUSCLES = 2;
const MAX_MUSCLES = 5;

/** Past this the list stops being a workout and starts being a menu. */
const MAX_EXERCISES = 8;

/**
 * What a reported limitation actually rules out.
 *
 * The catalog carries no joint data, so anything joint-specific would be a
 * guess dressed up as medicine. This is the defensible version: on an affected
 * region, drop the free-weight compounds and the expert-level movements, and
 * keep the machine, cable and isolation work. Every muscle stays trainable —
 * a knee complaint must not silently delete legs from the app.
 */
const LIMITATION_MUSCLES: Record<string, string[]> = {
  back: ['lower_back', 'lats', 'upper_back', 'glutes', 'hamstrings'],
  knees: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors'],
  shoulders: ['front_delt', 'side_delt', 'rear_delt', 'upper_chest', 'mid_chest', 'lower_chest'],
  wrists: ['forearms', 'biceps', 'triceps'],
};

const FREE_WEIGHT = new Set(['barbell', 'dumbbell', 'kettlebell', 'plate']);

/**
 * What this app programs, and what it does not.
 *
 * The catalog is 873 exercises across seven categories, and only three of them
 * are resistance training. The first pass ignored this and the generator
 * cheerfully prescribed *Alternate Leg Diagonal Bound*, *Box Jump* and
 * *Backward Drag* for a strength session — all legitimate quad exercises, none
 * of them loadable, so every weight field came back blank and the rank engine
 * had nothing to score. The synthetic self-check could not have caught it;
 * running the generator against the real catalog did, immediately.
 *
 * Stretching and cardio are excluded outright — this is a lifting app, and
 * neither ranks. Plyometrics, strongman and olympic work are *fallbacks*: real
 * training, but not what someone who asked for a 60-minute session expects to
 * be handed first.
 */
const PRIMARY_CATEGORIES = new Set(['strength', 'powerlifting']);
const EXCLUDED_CATEGORIES = new Set(['stretching', 'cardio']);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Gyms load in 2.5 kg steps; a suggestion of 47.3 kg is not a suggestion. */
export const roundLoad = (kg: number) => Math.round(kg / 2.5) * 2.5;

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

// ── muscle selection ──────────────────────────────────────────────

/**
 * Which muscles this session is for.
 *
 * Recovered first — training a cooked muscle is how people stall — then weakest
 * first, because the Bodygraph's grey regions are the whole point of the app.
 * If nothing is recovered the filter is dropped rather than returning an empty
 * session: someone who opens the Workout tab wants a workout, and the Home
 * tab has already told them today is better spent resting.
 */
export function pickMuscles(input: GenInput): GenMuscle[] {
  const want = clamp(Math.round(input.durationMin / MIN_PER_MUSCLE), MIN_MUSCLES, MAX_MUSCLES);

  let pool = input.muscles;
  if (input.onlyMuscles?.length) {
    const set = new Set(input.onlyMuscles);
    pool = pool.filter((m) => set.has(m.id));
  }

  const recovered = pool.filter((m) => (input.fatigue[m.id] ?? 0) < FRESH_BELOW);
  const from = recovered.length >= MIN_MUSCLES ? recovered : pool;

  return from
    .slice()
    .sort(
      (a, b) =>
        (input.percentile[a.id] ?? 0) - (input.percentile[b.id] ?? 0) ||
        b.size - a.size ||
        a.id.localeCompare(b.id),
    )
    .slice(0, want);
}

// ── exercise selection ────────────────────────────────────────────

/** Everything the user could legitimately be given for one muscle, best first. */
export function candidatesFor(input: GenInput, muscleId: string): GenExercise[] {
  const kit = input.equipment?.length ? new Set(input.equipment) : null;
  const levels = new Set(LEVELS_BY_DIFFICULTY[input.difficulty]);
  const limited = new Set(
    input.limitations.flatMap((l) => LIMITATION_MUSCLES[l] ?? []),
  );

  return input.catalog
    .filter((ex) => {
      if (ex.primary[0] !== muscleId) return false;
      if (EXCLUDED_CATEGORIES.has(ex.category)) return false;
      if (kit && !kit.has(ex.equipment)) return false;
      if (!levels.has(ex.level)) return false;
      if (limited.has(muscleId)) {
        if (ex.level === 'expert') return false;
        if (ex.mechanic === 'compound' && FREE_WEIGHT.has(ex.equipment)) return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        // Resistance training first. Plyometrics and strongman work are still
        // here, but only once the barbell has run out.
        Number(PRIMARY_CATEGORIES.has(b.category)) - Number(PRIMARY_CATEGORIES.has(a.category)) ||
        // Something the user has done before wins next: it comes with real PREV
        // numbers instead of an estimate, which is the difference between
        // logging a set and guessing at one.
        Number(!!input.history[b.id]) - Number(!!input.history[a.id]) ||
        Number(b.mechanic === 'compound') - Number(a.mechanic === 'compound') ||
        a.id.localeCompare(b.id),
    );
}

// ── the session ───────────────────────────────────────────────────

function planSets(
  input: GenInput,
  ex: GenExercise,
  sets: number,
  withWarmup: boolean,
): { sets: PlannedSet[]; fromHistory: boolean } {
  const last = input.history[ex.id];
  const reps = last?.reps || Math.round((ex.repMin + ex.repMax) / 2);
  const weight = last ? last.weightKg : input.estimate(ex, reps);
  // Respect what they actually did last time, but stay within one set of what
  // the difficulty chip asked for — otherwise a single 8-set session ago
  // rewrites the prescription forever.
  const working = last?.sets ? clamp(last.sets, sets, sets + 1) : sets;

  const out: PlannedSet[] = [];
  let n = 1;
  // One warm-up on the session's opening compound only. Ramping into a cable
  // fly is not a thing anyone does, and every extra row is a row to dismiss.
  if (withWarmup && weight != null && weight > 20) {
    out.push({ setNumber: n++, isWarmup: true, targetReps: Math.min(12, reps + 4), weightKg: roundLoad(weight * 0.5) });
  }
  for (let i = 0; i < working; i++) {
    out.push({ setNumber: n++, isWarmup: false, targetReps: reps, weightKg: weight == null ? null : roundLoad(weight) });
  }
  return { sets: out, fromHistory: !!last };
}

const costOf = (ex: PlannedExercise) =>
  TRANSITION_SEC +
  ex.sets.reduce((n, s) => n + (s.isWarmup ? WARMUP_SEC : WORK_SEC + ex.restSec), 0);

/**
 * Build the session.
 *
 * Muscles are taken round-robin rather than one muscle at a time, so a session
 * that runs out of time still touches everything it promised in the Target
 * Muscles cards instead of five sets of one thing and nothing else.
 */
export function generate(input: GenInput): GeneratedWorkout {
  const focusMuscles = pickMuscles(input);
  const budget = Math.max(0, input.durationMin) * 60;
  const setsPer = SETS_BY_DIFFICULTY[input.difficulty];

  const queues = new Map(focusMuscles.map((m) => [m.id, candidatesFor(input, m.id)]));
  const taken = new Set<string>();
  const exercises: PlannedExercise[] = [];
  let spent = 0;

  for (let round = 0; exercises.length < MAX_EXERCISES; round++) {
    let placedAny = false;
    for (const m of focusMuscles) {
      if (exercises.length >= MAX_EXERCISES) break;
      const queue = queues.get(m.id) ?? [];
      const ex = queue.find((c) => !taken.has(c.id));
      if (!ex) continue;

      const { sets, fromHistory } = planSets(input, ex, setsPer, round === 0 && ex.mechanic === 'compound');
      const planned: PlannedExercise = {
        exerciseId: ex.id,
        name: ex.name,
        primaryMuscle: ex.primary[0],
        equipment: ex.equipment,
        mechanic: ex.mechanic,
        restSec: ex.restSec,
        sets,
        fromHistory,
      };

      const cost = costOf(planned);
      // The first exercise always goes in, however tight the budget: a 10-minute
      // session with nothing in it is worse than one that runs 3 minutes over.
      if (exercises.length && spent + cost > budget) continue;

      taken.add(ex.id);
      exercises.push(planned);
      spent += cost;
      placedAny = true;
    }
    if (!placedAny) break;
  }

  const totalSize = focusMuscles.reduce((n, m) => n + m.size, 0);
  const groups = Array.from(new Set(focusMuscles.map((m) => m.group))).map(titleCase);

  return {
    title: groups.length
      ? groups.length > 1
        ? `${groups.slice(0, -1).join(', ')} & ${groups[groups.length - 1]}`
        : groups[0]
      : 'Workout',
    durationMin: input.durationMin,
    estimatedSec: spent,
    focus: focusMuscles.map((m) => ({
      muscleId: m.id,
      label: m.label,
      share: totalSize ? Math.round((m.size / totalSize) * 100) / 100 : 0,
    })),
    exercises,
  };
}

// ── self-check ────────────────────────────────────────────────────
// Run at boot beside e1rm/standards/recovery. A generator that quietly ignores
// someone's equipment sends them to a gym they cannot use, which looks like the
// app is broken rather than like a bad recommendation.

export const __selfcheck = () => {
  const fail = (m: string) => {
    throw new Error(`generator: ${m}`);
  };

  const muscles: GenMuscle[] = [
    { id: 'quads', label: 'Quads', group: 'legs', size: 5 },
    { id: 'mid_chest', label: 'Mid Chest', group: 'chest', size: 4 },
    { id: 'lats', label: 'Lats', group: 'back', size: 4 },
    { id: 'biceps', label: 'Biceps', group: 'arms', size: 2 },
  ];

  const ex = (
    id: string,
    primary: string,
    equipment: string,
    mechanic: GenExercise['mechanic'],
    level: GenExercise['level'] = 'intermediate',
    category = 'strength',
  ): GenExercise => ({
    id,
    name: id.replace(/_/g, ' '),
    primary: [primary],
    secondary: [],
    equipment,
    level,
    mechanic,
    category,
    repMin: 6,
    repMax: 10,
    restSec: 90,
  });

  const catalog: GenExercise[] = [
    // `a_…` names so alphabetical order puts the wrong answers first — the
    // ranking rules have to be what surfaces the barbell squat, not luck.
    ex('a_box_jump', 'quads', 'bodyweight', 'compound', 'intermediate', 'plyometrics'),
    ex('a_quad_stretch', 'quads', 'bodyweight', 'isolation', 'beginner', 'stretching'),
    ex('a_treadmill', 'quads', 'machine', 'compound', 'beginner', 'cardio'),
    ex('squat', 'quads', 'barbell', 'compound'),
    ex('leg_press', 'quads', 'machine', 'compound'),
    ex('leg_extension', 'quads', 'machine', 'isolation'),
    ex('pistol_squat', 'quads', 'bodyweight', 'compound', 'expert'),
    ex('bench', 'mid_chest', 'barbell', 'compound'),
    ex('pec_deck', 'mid_chest', 'machine', 'isolation'),
    ex('pushup', 'mid_chest', 'bodyweight', 'compound', 'beginner'),
    ex('pulldown', 'lats', 'cable', 'compound'),
    ex('pullup', 'lats', 'bodyweight', 'compound'),
    ex('curl', 'biceps', 'dumbbell', 'isolation'),
  ];

  const base: GenInput = {
    muscles,
    fatigue: {},
    percentile: {},
    catalog,
    equipment: null,
    limitations: [],
    durationMin: 60,
    difficulty: 'intermediate',
    history: {},
    estimate: () => 60,
  };

  // ── muscle selection ──
  const cooked = pickMuscles({ ...base, fatigue: { quads: 0.9, mid_chest: 0.9 } });
  if (cooked.some((m) => m.id === 'quads')) fail('a cooked muscle was still programmed');
  if (cooked.length < MIN_MUSCLES) fail('a session should target at least two muscles');

  // Weakest first, and an untrained muscle (percentile 0) is the weakest there is.
  const ordered = pickMuscles({ ...base, percentile: { quads: 90, mid_chest: 80, lats: 10, biceps: 5 } });
  if (ordered[0].id !== 'biceps') fail(`weakest muscle should come first, got ${ordered[0].id}`);

  // Everything cooked must still produce a workout, not an empty screen.
  const allCooked = pickMuscles({ ...base, fatigue: Object.fromEntries(muscles.map((m) => [m.id, 1])) });
  if (allCooked.length < MIN_MUSCLES) fail('a fully fatigued user must still be given something');

  // A short session is focused; a long one is broad.
  if (!(pickMuscles({ ...base, durationMin: 20 }).length < pickMuscles({ ...base, durationMin: 90 }).length))
    fail('duration should change how many muscles are trained');

  // ── what counts as a workout ──
  // This is the bug real data found and the synthetic fixture originally
  // could not: every one of these is a legitimate quad exercise, and none of
  // them is what someone asking for a lifting session means.
  const quads = candidatesFor(base, 'quads');
  if (quads.some((c) => c.category === 'stretching' || c.category === 'cardio'))
    fail('a stretch or a treadmill was offered as a workout exercise');
  const lastLifting = quads.map((c) => PRIMARY_CATEGORIES.has(c.category)).lastIndexOf(true);
  const firstOther = quads.map((c) => PRIMARY_CATEGORIES.has(c.category)).indexOf(false);
  if (firstOther !== -1 && firstOther < lastLifting)
    fail(`${quads[firstOther].category} ranked above resistance training`);
  // ...but plyometrics stay available rather than being deleted from the app.
  if (!quads.some((c) => c.category === 'plyometrics'))
    fail('plyometrics should still be reachable, just not first');
  if (generate(base).exercises.some((e) => ['a_box_jump', 'a_treadmill', 'a_quad_stretch'].includes(e.exerciseId)))
    fail('a generated session contained a non-strength exercise while barbell work was available');

  // ── equipment and limitations ──
  const home = candidatesFor({ ...base, equipment: ['bodyweight'] }, 'mid_chest');
  if (!home.length) fail('bodyweight-only must still find chest work');
  if (home.some((c) => c.equipment !== 'bodyweight')) fail('equipment the user does not have was prescribed');

  const beginner = candidatesFor({ ...base, difficulty: 'beginner' }, 'quads');
  if (beginner.some((c) => c.level !== 'beginner')) fail('a beginner was given an advanced movement');

  const badKnees = candidatesFor({ ...base, limitations: ['knees'] }, 'quads');
  if (!badKnees.length) fail('a knee limitation deleted legs entirely');
  if (badKnees.some((c) => c.id === 'squat')) fail('a knee limitation should drop the barbell squat');
  if (!badKnees.some((c) => c.id === 'leg_extension')) fail('machine leg work should survive a knee limitation');

  // A limitation on one region must not touch another.
  if (candidatesFor({ ...base, limitations: ['knees'] }, 'mid_chest').length !== candidatesFor(base, 'mid_chest').length)
    fail('a knee limitation changed the chest options');

  // Something the user has done before outranks something they have not.
  const known = candidatesFor({ ...base, history: { leg_extension: { weightKg: 50, reps: 10, sets: 3 } } }, 'quads');
  if (known[0].id !== 'leg_extension') fail('a previously performed exercise should be offered first');

  // ── the session ──
  const hour = generate(base);
  if (!hour.exercises.length) fail('an hour produced no exercises');
  if (new Set(hour.exercises.map((e) => e.exerciseId)).size !== hour.exercises.length)
    fail('the same exercise was programmed twice');
  if (hour.exercises.some((e) => !e.sets.some((s) => !s.isWarmup)))
    fail('an exercise was programmed with no working sets');
  if (!(hour.estimatedSec <= 60 * 60 + TRANSITION_SEC))
    fail(`an hour session was planned for ${Math.round(hour.estimatedSec / 60)} minutes`);
  if (Math.abs(hour.focus.reduce((n, f) => n + f.share, 0) - 1) > 0.02)
    fail('target-muscle shares should sum to 1');

  // Time is the binding constraint, and it must bind in the right direction.
  const quick = generate({ ...base, durationMin: 15 });
  if (!quick.exercises.length) fail('a 15-minute session must still contain something');
  if (quick.exercises.length >= hour.exercises.length)
    fail('a short session should not be as long as an hour');

  // Round-robin: every targeted muscle that has an available exercise gets one
  // before any muscle gets a second.
  const first = generate({ ...base, durationMin: 90 });
  const firstPass = first.exercises.slice(0, first.focus.length).map((e) => e.primaryMuscle);
  if (new Set(firstPass).size !== firstPass.length)
    fail('one muscle was given two exercises before another got its first');

  // Numbers: from history when it exists, from the estimate when it does not,
  // and blank rather than invented when there is nothing to go on.
  const withHistory = generate({ ...base, history: { bench: { weightKg: 82.5, reps: 5, sets: 4 } } });
  const bench = withHistory.exercises.find((e) => e.exerciseId === 'bench');
  if (!bench) fail('a previously performed lift was not programmed');
  if (!bench.fromHistory) fail('history was not used');
  const benchWork = bench.sets.filter((s) => !s.isWarmup);
  if (benchWork[0].weightKg !== 82.5 || benchWork[0].targetReps !== 5)
    fail('the pre-fill must be last session verbatim, not a prediction');

  const blank = generate({ ...base, estimate: () => null });
  if (blank.exercises.some((e) => e.sets.some((s) => s.weightKg !== null)))
    fail('a weight was invented for an exercise with no history and no estimate');
  if (blank.exercises.some((e) => e.sets.some((s) => s.isWarmup)))
    fail('a warm-up was planned with no load to ramp toward');

  // Loads land on the plates a gym actually has.
  const odd = generate({ ...base, estimate: () => 61.3 });
  for (const e of odd.exercises) {
    for (const s of e.sets) {
      if (s.weightKg != null && Math.abs(s.weightKg / 2.5 - Math.round(s.weightKg / 2.5)) > 1e-9)
        fail(`${e.exerciseId} suggested ${s.weightKg} kg, which is not loadable`);
    }
  }

  // Harder difficulty means more sets on the same movement, not a different one.
  const setsOf = (d: Difficulty) =>
    generate({ ...base, difficulty: d, durationMin: 120 }).exercises[0].sets.filter((s) => !s.isWarmup).length;
  if (!(setsOf('beginner') < setsOf('advanced'))) fail('difficulty should change the set count');

  // An empty catalog must return an empty session, not throw.
  const nothing = generate({ ...base, catalog: [] });
  if (nothing.exercises.length) fail('an empty catalog produced exercises');

  return 'generator ok';
};

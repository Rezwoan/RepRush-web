/**
 * Routine packages — prebuilt programs a user can adopt as their own.
 *
 * A file, not a table, for the same reason the exercise catalog is one: these
 * are static, identical for every user, and sql.js rewrites the whole database
 * on every flush. Claiming a package *does* write rows — real `routines` the
 * user then owns and can edit — because the point is that adopting a program
 * gives you something yours, not a pointer to something shared.
 *
 * Exercises are named, not catalog ids, and resolved through
 * `CatalogService.resolveLegacyName` — the same hand-checked table that mapped
 * v1's history onto the catalog in P2. A boot self-check asserts every name in
 * every package still resolves, so a package can never ship a day that cannot
 * be started.
 *
 * `price` is in Spark. The starter is free; later packages are what the
 * currency is for.
 */

export interface PackageExercise {
  /** Legacy-style display name, resolved to a catalog id at claim time. */
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
}

export interface PackageDay {
  name: string;
  focus: string;
  exercises: PackageExercise[];
}

export interface RoutinePackage {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Spark. 0 = free. */
  price: number;
  level: 'beginner' | 'intermediate' | 'advanced';
  days: PackageDay[];
}

const e = (
  name: string,
  sets: number,
  repMin: number,
  repMax: number,
  restSec: number,
): PackageExercise => ({ name, sets, repMin, repMax, restSec });

/**
 * The six-day upper/lower/push/pull/leg/arms split.
 *
 * This is not invented: it is the program both real accounts have been running
 * since v1 — all 48 logged sessions are one of these six types — transcribed
 * from the `exercise_plans` rows they were actually training off. It ships as
 * the free starter because it is the one program we know works in this gym.
 *
 * One substitution: v1's `Core Exercise (User Choice)` is the single legacy
 * name with no catalog equivalent (it is the six unmapped sets P2 reported), so
 * the Leg day's core slot names a real movement instead. A day has to be
 * startable.
 */
const ULPPL6: RoutinePackage = {
  id: 'pkg.ulppl6',
  name: 'Upper / Lower / Push / Pull / Legs / Arms',
  tagline: 'Six days · the house split',
  description:
    'Two heavy days to build strength, then four hypertrophy days that give every muscle its own slot. The program RepRush was built around — start here, then change whatever you like.',
  price: 0,
  level: 'intermediate',
  days: [
    {
      name: 'Upper',
      focus: 'Strength & Power',
      exercises: [
        e('Barbell Bench Press', 3, 5, 8, 180),
        e('Lat Pulldowns (Wide Grip)', 3, 5, 8, 180),
        e('Overhead Press', 3, 5, 8, 180),
        e('Barbell Rows', 3, 5, 8, 180),
        e('Barbell Bicep Curls', 3, 8, 10, 90),
      ],
    },
    {
      name: 'Lower',
      focus: 'Strength & Power',
      exercises: [
        e('Barbell Squats', 3, 5, 8, 240),
        e('Romanian Deadlifts', 3, 5, 8, 180),
        e('Leg Press', 3, 5, 8, 180),
        e('Lying Leg Curls', 3, 5, 8, 90),
        e('Standing Calf Raises', 3, 8, 10, 60),
      ],
    },
    {
      name: 'Push',
      focus: 'Chest, Shoulders, Triceps',
      exercises: [
        e('Incline DB Press', 3, 5, 8, 120),
        e('Seated DB Press', 3, 5, 8, 90),
        e('DB Lateral Raises', 3, 8, 12, 60),
        e('Pec Deck Machine Flyes', 3, 8, 12, 60),
        e('EZ Bar Skullcrushers', 3, 8, 12, 90),
      ],
    },
    {
      name: 'Pull',
      focus: 'Back, Biceps, Rear Delts',
      exercises: [
        e('V-Grip Lat Pulldowns', 3, 5, 8, 90),
        e('Chest-Supported T-Bar Row', 3, 5, 8, 90),
        e('DB Rear Delt Flyes', 3, 10, 15, 60),
        e('Incline DB Curls', 3, 8, 12, 60),
        e('DB Hammer Curls', 3, 8, 12, 60),
      ],
    },
    {
      name: 'Leg',
      focus: 'Quads, Hamstrings, Calves, Core',
      exercises: [
        e('Hack Squats', 3, 5, 8, 180),
        e('Leg Extensions', 3, 5, 8, 60),
        e('Seated Leg Curls', 3, 5, 8, 60),
        e('Seated Calf Raises', 3, 10, 15, 45),
        e('Crunches', 3, 8, 15, 60),
      ],
    },
    {
      name: 'Arms',
      focus: 'Biceps, Triceps',
      exercises: [
        e('Close-Grip Bench Press', 3, 5, 8, 180),
        e('Heavy DB Supinating Curls', 3, 5, 8, 120),
        e('Rope Triceps Pushdowns', 3, 8, 12, 90),
        e('Incline DB Curls', 3, 8, 12, 90),
        e('Overhead Cable Extensions', 3, 10, 15, 90),
        e('Close Grip EZ Bar Curls', 3, 10, 15, 90),
      ],
    },
  ],
};

export const ROUTINE_PACKAGES: RoutinePackage[] = [ULPPL6];

export const packageById = (id: string) => ROUTINE_PACKAGES.find((p) => p.id === id) ?? null;

/**
 * Structural checks. The *resolution* check — that every exercise name maps to
 * a real catalog id — needs the catalog and so lives in `ProfileService`'s boot
 * self-check, where the catalog is injected.
 */
export const __selfcheck = () => {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error(`routine-packages: ${m}`);
  };
  assert(ROUTINE_PACKAGES.length > 0, 'at least one package');
  const ids = new Set<string>();
  for (const p of ROUTINE_PACKAGES) {
    assert(!ids.has(p.id), `duplicate package id ${p.id}`);
    ids.add(p.id);
    assert(p.price >= 0, `${p.id} price is not negative`);
    assert(p.days.length > 0, `${p.id} has days`);
    for (const d of p.days) {
      assert(d.exercises.length > 0, `${p.id}/${d.name} has exercises`);
      for (const x of d.exercises) {
        assert(x.sets > 0, `${p.id}/${d.name}/${x.name} has sets`);
        // A rep range the wrong way round silently prescribes an empty target.
        assert(x.repMin > 0 && x.repMax >= x.repMin, `${p.id}/${d.name}/${x.name} rep range`);
        assert(x.restSec >= 0, `${p.id}/${d.name}/${x.name} rest`);
      }
    }
  }
  // Exactly one free package, or a new account has nothing to start from.
  assert(ROUTINE_PACKAGES.some((p) => p.price === 0), 'at least one package is free');
  return 'routine packages ok';
};

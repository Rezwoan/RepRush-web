/**
 * Muscle taxonomy.
 *
 * These ids are the contract between the exercise catalog, the rank engine, the
 * recovery model and the Bodygraph art. Renaming one silently breaks all four,
 * so treat the id strings as permanent; change `label` instead.
 *
 * `size` is the relative contribution to Bodyrank and the recovery half-life:
 * big muscles matter more to the overall score and take longer to recover.
 */

export const MUSCLES = [
  // ── Upper, front ──────────────────────────────────────────────
  { id: 'neck',         label: 'Neck',          group: 'core',      view: 'both',  size: 1 },
  { id: 'traps',        label: 'Traps',         group: 'back',      view: 'both',  size: 3 },
  { id: 'front_delt',   label: 'Front Delt',    group: 'shoulders', view: 'front', size: 2 },
  { id: 'side_delt',    label: 'Side Delt',     group: 'shoulders', view: 'both',  size: 2 },
  { id: 'rear_delt',    label: 'Rear Delt',     group: 'shoulders', view: 'back',  size: 2 },
  { id: 'upper_chest',  label: 'Upper Chest',   group: 'chest',     view: 'front', size: 3 },
  { id: 'mid_chest',    label: 'Mid Chest',     group: 'chest',     view: 'front', size: 4 },
  { id: 'lower_chest',  label: 'Lower Chest',   group: 'chest',     view: 'front', size: 2 },
  { id: 'biceps',       label: 'Biceps',        group: 'arms',      view: 'front', size: 2 },
  { id: 'triceps',      label: 'Triceps',       group: 'arms',      view: 'back',  size: 3 },
  { id: 'forearms',     label: 'Forearms',      group: 'arms',      view: 'both',  size: 2 },

  // ── Upper, back ───────────────────────────────────────────────
  { id: 'lats',         label: 'Lats',          group: 'back',      view: 'back',  size: 4 },
  { id: 'upper_back',   label: 'Upper Back',    group: 'back',      view: 'back',  size: 3 },
  { id: 'lower_back',   label: 'Lower Back',    group: 'back',      view: 'back',  size: 3 },

  // ── Core ──────────────────────────────────────────────────────
  { id: 'abs',          label: 'Abs',           group: 'core',      view: 'front', size: 2 },
  { id: 'obliques',     label: 'Obliques',      group: 'core',      view: 'front', size: 2 },

  // ── Lower ─────────────────────────────────────────────────────
  { id: 'glutes',       label: 'Glutes',        group: 'legs',      view: 'back',  size: 4 },
  { id: 'quads',        label: 'Quads',         group: 'legs',      view: 'front', size: 5 },
  { id: 'hamstrings',   label: 'Hamstrings',    group: 'legs',      view: 'back',  size: 4 },
  { id: 'adductors',    label: 'Adductors',     group: 'legs',      view: 'front', size: 2 },
  { id: 'calves',       label: 'Calves',        group: 'legs',      view: 'both',  size: 2 },
] as const;

export type MuscleId = (typeof MUSCLES)[number]['id'];
export type MuscleGroup = (typeof MUSCLES)[number]['group'];
export type MuscleView = 'front' | 'back' | 'both';

export const MUSCLE_IDS = MUSCLES.map((m) => m.id) as readonly MuscleId[];

export const MUSCLE_BY_ID = Object.fromEntries(MUSCLES.map((m) => [m.id, m])) as Record<
  MuscleId,
  (typeof MUSCLES)[number]
>;

export const muscleLabel = (id: MuscleId) => MUSCLE_BY_ID[id]?.label ?? id;

export const GROUP_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  legs: 'Legs',
};

export const MUSCLE_GROUPS = Object.keys(GROUP_LABEL) as MuscleGroup[];

export const musclesInGroup = (g: MuscleGroup) => MUSCLES.filter((m) => m.group === g);

/** Muscles drawn on a given view of the Bodygraph. */
export const musclesInView = (v: 'front' | 'back') =>
  MUSCLES.filter((m) => m.view === v || m.view === 'both');

/** Total `size` across all muscles — the denominator for Bodyrank weighting. */
export const TOTAL_MUSCLE_SIZE = MUSCLES.reduce((n, m) => n + m.size, 0);

// `recoveryHalfLifeHours` used to live here, unused, with a different curve to
// the one the engine actually runs. Recovery is computed server-side in
// `backend/src/ranks/recovery.ts` from the same `size` values below; the client
// only renders the fatigue numbers it is handed. Two formulas for one model is
// a drift bug waiting for someone to trust the wrong one.

// ── self-check ────────────────────────────────────────────────────
export const __selfcheck = () => {
  const ids = new Set<string>();
  for (const m of MUSCLES) {
    if (ids.has(m.id)) throw new Error(`duplicate muscle id: ${m.id}`);
    ids.add(m.id);
    if (!GROUP_LABEL[m.group]) throw new Error(`${m.id}: unknown group ${m.group}`);
    if (m.size < 1 || m.size > 5) throw new Error(`${m.id}: size out of range`);
  }
  // Every muscle must be reachable from at least one view, or it can never be
  // shown or tapped on the Bodygraph.
  const drawn = new Set([...musclesInView('front'), ...musclesInView('back')].map((m) => m.id));
  for (const m of MUSCLES) if (!drawn.has(m.id)) throw new Error(`${m.id} is on no view`);
  if (TOTAL_MUSCLE_SIZE <= 0) throw new Error('bad total size');
  return `${MUSCLES.length} muscles ok`;
};

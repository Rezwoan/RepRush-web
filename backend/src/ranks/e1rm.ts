/**
 * Estimated one-rep max.
 *
 * Epley, as SPEC §6 specifies: `e1RM = weight × (1 + reps/30)`.
 *
 * Reps are capped at 12 before the formula is applied. Past about 12 the
 * rep-max formulas stop tracking reality and start rewarding endurance — an
 * honest 20-rep set of 60 kg is not a 100 kg single, and without the cap a
 * high-rep burnout set would outrank a genuine heavy triple.
 */

export const REP_CAP = 12;

export function e1rm(weightKg: number, reps: number): number {
  if (!(weightKg > 0) || !(reps > 0)) return 0;
  return weightKg * (1 + Math.min(reps, REP_CAP) / 30);
}

/**
 * Load a set actually put through the target muscles.
 *
 * For bodyweight movements the logged weight is what was *added* (often zero),
 * so the athlete's own mass is the load. Without this a perfect set of pull-ups
 * scores zero and every calisthenics user is permanently unranked.
 */
export function effectiveLoad(weightKg: number, equipment: string, bodyweightKg: number): number {
  return equipment === 'bodyweight' ? bodyweightKg + (weightKg || 0) : weightKg || 0;
}

// ── self-check ────────────────────────────────────────────────────
export const __selfcheck = () => {
  const close = (a: number, b: number, msg: string) => {
    if (Math.abs(a - b) > 0.01) throw new Error(`${msg}: expected ${b}, got ${a}`);
  };

  close(e1rm(100, 1), 100 * (1 + 1 / 30), 'a single is barely above the load');
  close(e1rm(100, 5), 116.67, '100kg x 5');
  close(e1rm(60, 12), 84, '60kg x 12');

  // The cap: 20 reps must score exactly the same as 12, not more.
  if (e1rm(60, 20) !== e1rm(60, 12)) throw new Error('reps must be capped at 12');
  // And a heavy triple must still beat a light high-rep set.
  if (!(e1rm(100, 3) > e1rm(60, 20))) throw new Error('a heavy triple should outrank a light burnout set');

  // Monotonic in both arguments, up to the cap.
  if (!(e1rm(100, 6) > e1rm(100, 5))) throw new Error('more reps at the same load must score higher');
  if (!(e1rm(105, 5) > e1rm(100, 5))) throw new Error('more load at the same reps must score higher');

  // Degenerate input is 0, never NaN — an unlogged or bodyweight-only set.
  for (const [w, r] of [[0, 5], [100, 0], [-5, 5], [NaN, 5]] as [number, number][]) {
    if (e1rm(w, r) !== 0) throw new Error(`e1rm(${w}, ${r}) should be 0`);
  }

  // Bodyweight movements carry the athlete; everything else does not.
  close(effectiveLoad(0, 'bodyweight', 80), 80, 'unweighted pull-up loads bodyweight');
  close(effectiveLoad(20, 'bodyweight', 80), 100, 'weighted pull-up adds to bodyweight');
  close(effectiveLoad(60, 'barbell', 80), 60, 'barbell load is just the bar');

  return 'e1rm ok';
};

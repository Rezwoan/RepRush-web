/**
 * Which day of a program comes next.
 *
 * ## Why this is its own file
 *
 * Two screens answer this question — Home's *Today's Workout* card and the
 * Workout tab's routine chooser — and they must never disagree. A card that
 * says "Pull" over a list whose `Next up` badge says "Legs" reads as a bug in
 * both, and there is no way for the user to tell which one is lying. This is
 * the same call P6 made when recovery moved into `RanksService` because the
 * Recovery Zone card and the generator were about to disagree about which
 * muscles were fresh.
 *
 * So: one pure function, called by `ProfileService.listRoutines` (which
 * publishes the answer as `nextRoutineId`) and by `HomeService.today`.
 * The frontend consumes that field rather than recomputing it.
 *
 * ## The rule
 *
 * 1. **Anything never trained comes first**, in program order. A day you have
 *    never done is more overdue than one you did a fortnight ago, and on a
 *    freshly claimed package this makes the program run in the order it was
 *    written rather than starting somewhere arbitrary.
 * 2. **Otherwise, the day after the most recent one**, wrapping. This is what
 *    "what he did last session" means for a split: after Upper comes Lower,
 *    not whichever day happens to be oldest.
 *
 * Rule 2 is deliberately *order*-based rather than "longest unused". They agree
 * while a program is run in sequence and diverge the moment a day is skipped —
 * and there, continuing the sequence is right. Skipping legs once should not
 * make the app demand legs for the rest of the week.
 */

export interface RotatableRoutine {
  id: number;
  /** Position within its folder. Null sorts as 0 — see `byOrder`. */
  sortOrder?: number | null;
  /** Null means never started. */
  lastUsedAt?: Date | string | null;
}

const stamp = (r: RotatableRoutine): number =>
  r.lastUsedAt ? new Date(r.lastUsedAt).getTime() : 0;

/**
 * Program order, with `id` as the tiebreaker.
 *
 * The tiebreaker is not decoration: routines created outside a package have no
 * `sortOrder`, so they all sort as 0 and would otherwise come back in whatever
 * order the database felt like — which makes "next" shuffle between requests.
 */
const byOrder = (a: RotatableRoutine, b: RotatableRoutine) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id;

/**
 * @param routines One program's days (or any set of routines to rotate over).
 * @returns The id to suggest next, or null when there is nothing to suggest.
 */
export function nextRoutineId(routines: RotatableRoutine[]): number | null {
  if (!routines?.length) return null;

  const ordered = [...routines].sort(byOrder);

  const neverTrained = ordered.find((r) => !stamp(r));
  if (neverTrained) return neverTrained.id;

  // Every day has been trained: continue the sequence from the most recent.
  const mostRecent = ordered.reduce((best, r) => (stamp(r) > stamp(best) ? r : best), ordered[0]);
  const at = ordered.findIndex((r) => r.id === mostRecent.id);
  return ordered[(at + 1) % ordered.length].id;
}

export const __selfcheck = () => {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`routine-rotation: ${msg}`);
  };
  const day = (id: number, sortOrder: number, lastUsedAt: string | null): RotatableRoutine => ({
    id,
    sortOrder,
    lastUsedAt,
  });

  assert(nextRoutineId([]) === null, 'no routines, nothing to suggest');

  // A freshly claimed package: nothing trained, so it starts at day one rather
  // than somewhere arbitrary.
  const fresh = [day(10, 0, null), day(11, 1, null), day(12, 2, null)];
  assert(nextRoutineId(fresh) === 10, 'an untouched program starts at its first day');

  // Ids deliberately out of program order — the answer must follow sortOrder,
  // not insertion, or a reordered program suggests the wrong day.
  const scrambled = [day(99, 2, null), day(7, 0, null), day(50, 1, null)];
  assert(nextRoutineId(scrambled) === 7, 'program order wins over id order');

  // Part-way through: day one done, so day two is next by *sequence*.
  const started = [day(1, 0, '2026-08-01'), day(2, 1, null), day(3, 2, null)];
  assert(nextRoutineId(started) === 2, 'an untrained day is preferred');

  // All trained: continue from the most recent, and wrap at the end.
  const cycling = [day(1, 0, '2026-08-05'), day(2, 1, '2026-08-06'), day(3, 2, '2026-08-04')];
  assert(nextRoutineId(cycling) === 3, 'after the most recent comes the next in order');

  const atEnd = [day(1, 0, '2026-08-04'), day(2, 1, '2026-08-05'), day(3, 2, '2026-08-06')];
  assert(nextRoutineId(atEnd) === 1, 'the sequence wraps around');

  // The case that separates this from "longest unused": legs (day 3) was
  // skipped long ago, but the user just did day 1, so day 2 is next. Longest
  // unused would have said 3 and kept saying 3.
  const skipped = [day(1, 0, '2026-08-08'), day(2, 1, '2026-08-02'), day(3, 2, '2026-07-01')];
  assert(nextRoutineId(skipped) === 2, 'a skipped day does not hijack the sequence');

  // Loose routines have no sortOrder; the id tiebreaker keeps them stable.
  const loose = [
    { id: 5, lastUsedAt: null },
    { id: 3, lastUsedAt: null },
  ];
  assert(nextRoutineId(loose) === 3, 'without sortOrder, the lowest id is stable and first');

  assert(nextRoutineId([day(42, 0, '2026-08-01')]) === 42, 'a single routine always repeats');

  return 'routine rotation ok';
};

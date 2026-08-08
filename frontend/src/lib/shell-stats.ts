/**
 * "The numbers in the top bar are stale — tell it to look again."
 *
 * Level, Spark and the streak are fetched once by the tab shell and re-fetched
 * on navigation. Claiming a reward changes all three without navigating
 * anywhere, so the balance in the bar sat at its old value until the page was
 * reloaded — the claim had worked, and the app said it hadn't.
 *
 * An event rather than a context because the things that spend and earn Spark
 * are panels several levels down inside `?view=` screens, and threading a
 * refresh callback through each of them is more code in more files than the
 * three lines here.
 */
export const STATS_CHANGED = 'reprush:stats';

/** Call after anything that moves Spark, XP or the streak. */
export function statsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STATS_CHANGED));
}

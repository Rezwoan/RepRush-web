/**
 * XP and the level curve (SPEC §9 → Levels card, §10 → XP & Levels).
 *
 * The itemised award is the same one the post-session chain shows
 * (`app/workout/summary/[id]/page.tsx` — P6). That screen has to work with no
 * signal, so it keeps its own copy of these four numbers rather than asking the
 * server for them; they are the *only* duplicated constants in the app and both
 * sites point at each other. `ponytail:` P11 owns the XP ledger and should make
 * the awarded total a stored fact, at which point this becomes the backfill.
 */
export const XP = {
  perWorkout: 200,
  perMinute: 1,
  perRecord: 10,
  perStreakDay: 4,
} as const;

/**
 * What level `n` costs to leave. Linear growth, so the curve stays legible: the
 * first level costs 522 XP, which is the number the reference screen shows.
 */
export const levelCost = (level: number) => 300 + 222 * Math.max(1, level);

/** Total XP → level, XP into that level, and what the next one costs. */
export function levelFromXp(totalXp: number) {
  let level = 1;
  let remaining = Math.max(0, Math.round(totalXp));
  while (remaining >= levelCost(level)) {
    remaining -= levelCost(level);
    level++;
  }
  return { level, intoLevel: remaining, nextLevelXp: levelCost(level), totalXp: Math.round(totalXp) };
}

export function __selfcheck() {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`xp selfcheck: ${msg}`);
  };

  assert(levelCost(1) === 522, 'the first level costs 522 XP, as the reference shows');
  assert(levelCost(2) > levelCost(1), 'levels get more expensive');

  const zero = levelFromXp(0);
  assert(zero.level === 1 && zero.intoLevel === 0, 'nobody starts above level 1');

  // The boundary is where an off-by-one hides: 521 XP must not be level 2.
  assert(levelFromXp(521).level === 1, '521 XP is still level 1');
  assert(levelFromXp(522).level === 2, '522 XP is exactly level 2');
  assert(levelFromXp(522).intoLevel === 0, 'a fresh level starts empty, not full');

  // Monotonic, and `intoLevel` never exceeds the level it is inside.
  let last = 0;
  for (let xp = 0; xp < 50_000; xp += 137) {
    const l = levelFromXp(xp);
    assert(l.level >= last, 'level never goes down as XP goes up');
    assert(l.intoLevel < l.nextLevelXp, 'progress into a level stays inside it');
    last = l.level;
  }
  return true;
}

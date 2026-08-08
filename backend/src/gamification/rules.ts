/**
 * The rules behind medals, quests and streak freezes (SPEC §10).
 *
 * Pure functions over numbers, so they can be self-checked without a database —
 * which matters more here than anywhere else in the app, because every one of
 * them pays out.
 */

/** How many days a streak can survive on banked freezes. */
export const FREEZE_EVERY_DAYS = 7;
export const MAX_FREEZES = 2;

const DAY_MS = 86_400_000;

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ISO week, e.g. `2026-W32` — the same identifier the leagues use. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * The streak, with freezes (SPEC §10): one earned per 7 unbroken days, at most
 * two banked, auto-spent to cover a single missed day.
 *
 * Derived by walking the training days rather than stored, so it cannot drift
 * from the sessions — and so a session logged offline yesterday still mends the
 * streak when it syncs. Nothing anywhere writes a freeze down.
 */
export function streakWithFreezes(days: string[], today: string) {
  const sorted = Array.from(new Set(days)).sort();
  if (!sorted.length) return { current: 0, best: 0, freezes: 0, freezesUsed: 0 };

  let run = 0;
  let best = 0;
  let freezes = 0;
  let used = 0;
  let previous: string | null = null;

  const advance = () => {
    run++;
    if (run > best) best = run;
    // A freeze is earned on every seventh unbroken day, never more than MAX.
    if (run % FREEZE_EVERY_DAYS === 0 && freezes < MAX_FREEZES) freezes++;
  };

  for (const day of sorted) {
    if (previous === null) {
      advance();
    } else {
      const gap = Math.round((Date.parse(day) - Date.parse(previous)) / DAY_MS);
      if (gap === 1) {
        advance();
      } else if (gap === 2 && freezes > 0) {
        // Exactly one missed day, and we can pay for it.
        freezes--;
        used++;
        advance();
      } else {
        run = 0;
        // Freezes are banked *within* a streak; a broken one starts empty.
        freezes = 0;
        advance();
      }
    }
    previous = day;
  }

  // Today being untrained does not break anything yet — the streak only ends
  // once a whole day has gone by, plus whatever the freezes can cover.
  const gapToToday = Math.round((Date.parse(today) - Date.parse(previous)) / DAY_MS);
  const covered = 1 + freezes; // yesterday, plus one day per banked freeze
  const current = gapToToday <= covered ? run : 0;

  return { current, best, freezes, freezesUsed: used };
}

// ── medals (SPEC §10) ───────────────────────────────────────────────

export interface MedalCategory {
  id: string;
  label: string;
  emblem: string;
  /** What the tiers count, in the copy shown under the medal. */
  unit: string;
  tiers: number[];
  flavour: string;
}

/** Five tiers per category, exactly as the reference shows. */
export const MEDAL_CATEGORIES: MedalCategory[] = [
  {
    id: 'workouts',
    label: 'Total Workouts',
    emblem: 'bolt',
    unit: 'workouts',
    tiers: [1, 10, 50, 150, 365],
    flavour: 'A journey of a thousand miles begins with a single step.',
  },
  {
    id: 'volume',
    label: 'Total Volume',
    emblem: 'dumbbell',
    unit: 'kg lifted',
    tiers: [10_000, 100_000, 500_000, 1_000_000, 5_000_000],
    flavour: 'The bar does not care how you feel about it.',
  },
  {
    id: 'level',
    label: 'Level Up!',
    emblem: 'star',
    unit: 'level',
    tiers: [2, 5, 10, 25, 50],
    flavour: 'Every rep is a deposit.',
  },
  {
    id: 'streak',
    label: 'On Fire!',
    emblem: 'flame',
    unit: 'day streak',
    tiers: [3, 7, 30, 100, 365],
    flavour: 'Showing up is most of it.',
  },
  {
    id: 'quests',
    label: 'Quest Master',
    emblem: 'trophy',
    unit: 'quests claimed',
    tiers: [1, 10, 50, 150, 500],
    flavour: 'Small goals, stacked.',
  },
];

/** Bronze → mythic, matching the medal art's four materials plus a locked state. */
export const MEDAL_MATERIALS = ['bronze', 'silver', 'gold', 'platinum', 'mythic'] as const;

export function medalProgress(category: MedalCategory, value: number) {
  const earned = category.tiers.filter((t) => value >= t).length;
  const next = category.tiers[earned] ?? null;
  return {
    earned,
    next,
    // Progress towards the next tier, from the one before it.
    progress: next
      ? Math.min(1, (value - (category.tiers[earned - 1] ?? 0)) / (next - (category.tiers[earned - 1] ?? 0)))
      : 1,
  };
}

// ── quests (SPEC §10) ───────────────────────────────────────────────

export interface QuestDef {
  id: string;
  label: string;
  /** What `progress` counts up to. */
  target: number;
  xp: number;
  currency: number;
  /** Which measurement of the period the progress comes from. */
  metric: 'workouts' | 'sets' | 'volume' | 'minutes' | 'records' | 'rankUps' | 'muscles' | 'streak';
}

export const DAILY_QUESTS: QuestDef[] = [
  { id: 'train', label: 'Complete a workout', target: 1, xp: 50, currency: 3, metric: 'workouts' },
  { id: 'sets', label: 'Log 12 working sets', target: 12, xp: 60, currency: 4, metric: 'sets' },
  { id: 'volume', label: 'Move 5,000 kg', target: 5000, xp: 70, currency: 5, metric: 'volume' },
  { id: 'minutes', label: 'Train for 30 minutes', target: 30, xp: 50, currency: 3, metric: 'minutes' },
  { id: 'muscles', label: 'Train 3 different muscles', target: 3, xp: 60, currency: 4, metric: 'muscles' },
];

export const WEEKLY_QUESTS: QuestDef[] = [
  { id: 'rankup', label: 'Rank up once', target: 1, xp: 300, currency: 5, metric: 'rankUps' },
  { id: 'sessions', label: 'Complete 3 workouts', target: 3, xp: 300, currency: 20, metric: 'workouts' },
  { id: 'records', label: 'Hit 3 personal records', target: 3, xp: 500, currency: 20, metric: 'records' },
  { id: 'volume', label: 'Move 30,000 kg', target: 30_000, xp: 350, currency: 15, metric: 'volume' },
  { id: 'streak', label: 'Reach a 3 day streak', target: 3, xp: 300, currency: 10, metric: 'streak' },
  { id: 'spread', label: 'Train 8 different muscles', target: 8, xp: 400, currency: 15, metric: 'muscles' },
];

/**
 * Deterministic rotation: which quests you get is a pure function of who you
 * are and which day or week it is.
 *
 * ponytail: a hash, not a stored rota. A rota table needs a cron to fill it and
 * can disagree with the clock; this cannot, and it gives everybody a different
 * daily quest without anything being written down. Upgrade path if quests ever
 * need to be hand-curated per season: replace `pick` with a lookup.
 */
export function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(pool: T[], seed: string, count: number): T[] {
  const chosen: T[] = [];
  const remaining = [...pool];
  for (let i = 0; i < count && remaining.length; i++) {
    chosen.push(remaining.splice(hash(`${seed}:${i}`) % remaining.length, 1)[0]);
  }
  return chosen;
}

// ── currency (SPEC §10) ─────────────────────────────────────────────

/** Spark earned for finishing a session, before the streak bonus. */
export const SPARK_PER_WORKOUT = 20;
/** …and one more per day of streak, capped so a long streak is not a salary. */
export const SPARK_STREAK_CAP = 10;

export const sessionSpark = (streak: number) =>
  SPARK_PER_WORKOUT + Math.min(SPARK_STREAK_CAP, Math.max(0, streak));

export function __selfcheck() {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`gamification selfcheck: ${msg}`);
  };
  const day = (n: number) => dayKey(new Date(Date.parse('2026-08-01') + n * DAY_MS));

  // ── streaks and freezes ──
  assert(streakWithFreezes([], day(0)).current === 0, 'no training, no streak');
  assert(streakWithFreezes([day(0)], day(0)).current === 1, 'training today is a 1-day streak');
  assert(streakWithFreezes([day(0)], day(1)).current === 1, 'yesterday still counts today');
  assert(streakWithFreezes([day(0)], day(2)).current === 0, 'two days off with no freeze ends it');

  const sixDays = Array.from({ length: 6 }, (_, i) => day(i));
  assert(streakWithFreezes(sixDays, day(5)).freezes === 0, 'six days earns no freeze yet');
  const sevenDays = Array.from({ length: 7 }, (_, i) => day(i));
  assert(streakWithFreezes(sevenDays, day(6)).freezes === 1, 'seven days earns one freeze');
  assert(
    streakWithFreezes(Array.from({ length: 21 }, (_, i) => day(i)), day(20)).freezes === MAX_FREEZES,
    'freezes cap at two',
  );

  // A missed day inside a streak is covered by a banked freeze, and spends it.
  const withGap = [...sevenDays, day(8)]; // day(7) missed
  const mended = streakWithFreezes(withGap, day(8));
  assert(mended.current === 8, 'a freeze covers one missed day and the streak continues');
  assert(mended.freezes === 0 && mended.freezesUsed === 1, 'covering a day spends the freeze');

  // Two missed days is more than one freeze can cover.
  const twoGap = [...sevenDays, day(9)];
  assert(streakWithFreezes(twoGap, day(9)).current === 1, 'two missed days break it even with a freeze');

  // A broken streak does not carry its freezes into the next one.
  assert(streakWithFreezes([...sevenDays, day(12), day(14)], day(14)).current === 1, 'a broken streak banks nothing');

  // ── medals ──
  for (const c of MEDAL_CATEGORIES) {
    assert(c.tiers.length === MEDAL_MATERIALS.length, `${c.id} has exactly five tiers`);
    assert(
      c.tiers.every((t, i) => i === 0 || t > c.tiers[i - 1]),
      `${c.id}'s tiers ascend`,
    );
  }
  const m = medalProgress(MEDAL_CATEGORIES[0], 0);
  assert(m.earned === 0 && m.next === 1, 'nothing earned at zero');
  assert(medalProgress(MEDAL_CATEGORIES[0], 10).earned === 2, 'ten workouts is two tiers');
  assert(medalProgress(MEDAL_CATEGORIES[0], 1e9).next === null, 'past the top tier there is no next');
  assert(medalProgress(MEDAL_CATEGORIES[0], 1e9).progress === 1, 'a maxed category reads full');

  // ── quests ──
  assert(new Set(DAILY_QUESTS.map((q) => q.id)).size === DAILY_QUESTS.length, 'daily ids unique');
  assert(new Set(WEEKLY_QUESTS.map((q) => q.id)).size === WEEKLY_QUESTS.length, 'weekly ids unique');
  const weekly = pick(WEEKLY_QUESTS, 'u1:2026-W32', 3);
  assert(weekly.length === 3, 'three weekly quests');
  assert(new Set(weekly.map((q) => q.id)).size === 3, 'and no duplicates among them');
  assert(
    pick(WEEKLY_QUESTS, 'u1:2026-W32', 3).map((q) => q.id).join() === weekly.map((q) => q.id).join(),
    'the same seed always picks the same quests',
  );
  assert(
    pick(WEEKLY_QUESTS, 'u2:2026-W32', 3).map((q) => q.id).join() !== weekly.map((q) => q.id).join() ||
      pick(WEEKLY_QUESTS, 'u1:2026-W33', 3).map((q) => q.id).join() !== weekly.map((q) => q.id).join(),
    'a different user or week eventually differs',
  );

  // ── currency ──
  assert(sessionSpark(0) === SPARK_PER_WORKOUT, 'no streak, no bonus');
  assert(sessionSpark(5) === SPARK_PER_WORKOUT + 5, 'the bonus tracks the streak');
  assert(sessionSpark(999) === SPARK_PER_WORKOUT + SPARK_STREAK_CAP, 'and it is capped');

  assert(isoWeek(new Date('2026-08-07')) === '2026-W32', 'iso week matches the leagues');
  return true;
}

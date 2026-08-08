import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { GymSession } from '../workouts/gym-session.entity';
import { WorkoutSet } from '../workouts/workout-set.entity';
import { PersonalRecord } from '../workouts/personal-record.entity';
import { BodyWeightLog } from '../body-weight/body-weight-log.entity';
import { CatalogService } from '../exercises/catalog.service';
import { Routine, RoutineFolder } from '../profile/routine.entity';
import { nextRoutineId } from '../profile/routine-rotation';
import { RanksService } from '../ranks/ranks.service';
import { effectiveLoad } from '../ranks/e1rm';
import { FRESH_BELOW, RecoveryStatus } from '../ranks/recovery';

/** The Last-14-Workouts block's window, and the comparison window behind it. */
const WINDOW_DAYS = 14;

/**
 * Resistance training sits around 5 METs. kcal = MET × 3.5 × kg / 200 × minutes
 * is the standard ACSM estimate.
 *
 * ponytail: an estimate, and labelled as one in the UI. A real figure needs
 * heart rate, which is a P13 device-integration problem. If that ever lands,
 * this is the only line that changes.
 */
const TRAINING_MET = 5;

/** Up from the previous window by this much reads as progressive overload. */
const TREND_BAND = 0.05;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day — streaks are counted in the user's days, not in UTC. */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const round = (n: number, dp = 0) => {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
};

/**
 * A day counts if a workout was completed on it (SPEC §10).
 *
 * Today not being trained yet does not break the streak — it only breaks once a
 * whole day has been missed, so the count doesn't read as 0 every morning.
 * Freezes are P11's; this is the plain rule underneath them.
 *
 * Exported because P9's streak leaderboard needs the same number the Home card
 * shows. Two implementations of "how long is your streak" is a bug the user
 * sees before we do.
 */
export function streaks(completedAt: Date[], now: Date) {
  const days = Array.from(new Set(completedAt.map(dayKey))).sort();
  if (!days.length) return { current: 0, best: 0 };

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = (Date.parse(days[i]) - Date.parse(days[i - 1])) / DAY_MS;
    run = gap === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }

  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - DAY_MS));
  const last = days[days.length - 1];
  if (last !== today && last !== yesterday) return { current: 0, best };

  let current = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if ((Date.parse(days[i]) - Date.parse(days[i - 1])) / DAY_MS !== 1) break;
    current++;
  }
  return { current, best };
}

export interface HomeSummary {
  user: { name: string; avatarId: string | null; streak: number; bestStreak: number };
  today: {
    state: 'resume' | 'start';
    sessionId: number | null;
    title: string;
    subtitle: string;
    focus: { muscleId: string; label: string; share: number }[];
    /**
     * Set when the suggestion is a day from the user's own program, so the card
     * can start *that* rather than dropping them on the builder. Null means the
     * suggestion was generated, which only happens when they have no routines.
     */
    routineId: number | null;
    /**
     * What the card is offering. **Only meaningful when `state` is `start`** —
     * a resumed session is neither a suggestion nor a generated one, and the
     * field is carried there only so the shape stays uniform.
     */
    source: 'routine' | 'generated';
  };
  recovery: {
    readiness: number;
    status: RecoveryStatus;
    headline: string;
    fresh: string[];
    fatigue: Record<string, number>;
  };
  goal: unknown | null;
  last14: {
    workouts: number;
    volumeKg: number;
    volumeTrendPct: number | null;
    trendLabel: string;
    sparkline: number[];
    durationMin: number;
    records: number;
    calories: number;
    bodyweight: { kg: number; trendKg: number | null; loggedOn: string } | null;
  };
}

@Injectable()
export class HomeService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(GymSession) private sessions: Repository<GymSession>,
    @InjectRepository(WorkoutSet) private sets: Repository<WorkoutSet>,
    @InjectRepository(PersonalRecord) private prs: Repository<PersonalRecord>,
    @InjectRepository(BodyWeightLog) private weights: Repository<BodyWeightLog>,
    // Registered as repositories rather than by importing ProfileModule: this
    // only reads routine rows to pick the next day, and a module edge for one
    // lookup is a dependency neither side needs. Same call WorkoutsModule makes.
    @InjectRepository(Routine) private routineRepo: Repository<Routine>,
    @InjectRepository(RoutineFolder) private folderRepo: Repository<RoutineFolder>,
    private catalog: CatalogService,
    private ranks: RanksService,
  ) {}

  /**
   * Everything the Home tab renders, in one call.
   *
   * One endpoint rather than six because the tab shows all of it at once and
   * every piece needs the same pass over the same sessions — six round trips
   * to a Pi over a phone connection is the thing worth avoiding here.
   */
  async summary(userId: number): Promise<HomeSummary> {
    const user = await this.users.findOne({ where: { id: userId } });
    const now = new Date();

    const sessions = await this.sessions.find({
      where: { userId },
      order: { startedAt: 'DESC' },
    });
    const completed = sessions.filter((s) => s.completedAt);
    const active = sessions.find((s) => !s.completedAt) ?? null;

    const { current: streak, best: bestStreak } = this.streaks(completed, now);
    const recovery = await this.recovery(userId);
    const last14 = await this.window(userId, completed, user, now);
    const today = await this.today(userId, active, recovery);

    return {
      user: { name: user?.name ?? '', avatarId: user?.avatarId ?? null, streak, bestStreak },
      today,
      recovery,
      goal: null, // filled by the controller from GoalsService
      last14,
    };
  }

  // ── streaks ───────────────────────────────────────────────────────

  private streaks(completed: GymSession[], now: Date) {
    return streaks(completed.map((s) => new Date(s.completedAt)), now);
  }

  // ── recovery ──────────────────────────────────────────────────────

  /**
   * The numbers come from `RanksService.recovery` — the same call the workout
   * generator makes, deliberately. This card and the generator disagreeing
   * about which muscles are fresh would read as a bug in both.
   */
  private async recovery(userId: number) {
    const r = await this.ranks.recovery(userId);
    return { ...r, headline: this.recoveryCopy(r.status, r.fresh) };
  }

  private recoveryCopy(status: RecoveryStatus, fresh: string[]) {
    const list =
      fresh.length > 1 ? `${fresh.slice(0, -1).join(', ')} and ${fresh[fresh.length - 1]}` : fresh[0];
    if (status === 'ready')
      return list ? `${list} are fresh and ready to work.` : 'Everything is fresh. Pick anything.';
    if (status === 'recovering')
      return list ? `Still recovering, but ${list} can take a session.` : 'Most of you is still recovering.';
    return 'You have trained hard. Today is better spent resting.';
  }

  // ── today's workout ───────────────────────────────────────────────

  /**
   * What the big blue card says.
   *
   * P6 owns the real generator; until then this names the muscles the generator
   * would pick anyway — recovered *and* lowest-ranked — so the card is honest
   * rather than a placeholder, and so the "target muscles" shape is already
   * settled when P6 arrives.
   */
  private async today(
    userId: number,
    active: GymSession | null,
    recovery: { status: RecoveryStatus; fatigue: Record<string, number> },
  ): Promise<HomeSummary['today']> {
    if (active) {
      return {
        state: 'resume',
        sessionId: active.id,
        title: active.workoutType || 'Workout in progress',
        subtitle: 'You left a session open. Pick up where you stopped.',
        focus: [],
        // A resumed session is not a suggestion: there is nothing to pick,
        // only somewhere to return to. `source` is inert here — see the type.
        routineId: null,
        source: 'routine',
      };
    }

    // ── follow the program, if there is one ──
    //
    // This card generated a muscle suggestion for everybody until now, so
    // somebody running a six-day split was told to train "Legs, Chest & Back"
    // while their own program said Pull. Routines are the answer whenever they
    // exist; the generator is the fallback for someone who has not chosen a
    // program, not the default for everyone.
    const suggested = await this.suggestedRoutine(userId);
    if (suggested) {
      const focus = this.focusFromRoutine(suggested.exercises);
      return {
        state: 'start',
        sessionId: null,
        title: suggested.name,
        subtitle: suggested.folderName
          ? `Next in ${suggested.folderName} · ${suggested.exercises.length} exercises`
          : `${suggested.exercises.length} exercises`,
        focus,
        routineId: suggested.id,
        source: 'routine',
      };
    }

    const muscles = await this.ranks.muscleRanks(userId);
    // Weakest first among what is recovered. An untrained muscle scores 0
    // percentile, which is exactly the "you have never worked this" signal.
    const candidates = muscles
      .filter((m) => (recovery.fatigue[m.muscleId] ?? 0) < FRESH_BELOW)
      .sort((a, b) => a.rank.percentile - b.rank.percentile || b.size - a.size)
      .slice(0, 3);

    const weight = candidates.reduce((n, m) => n + m.size, 0);
    const focus = candidates.map((m) => ({
      muscleId: m.muscleId,
      label: m.label,
      share: weight ? round(m.size / weight, 2) : 0,
    }));

    // "Legs, Chest & Back" — an ampersand between every pair reads like a bug.
    const groups = Array.from(new Set(candidates.map((m) => m.group))).map(this.titleCase);
    const title = groups.length
      ? groups.length > 1
        ? `${groups.slice(0, -1).join(', ')} & ${groups[groups.length - 1]}`
        : groups[0]
      : "Today's Workout";

    return {
      state: 'start',
      sessionId: null,
      title,
      subtitle:
        recovery.status === 'rest'
          ? 'Everything is still recovering — take it easy today.'
          : focus.length
            ? `Aimed at ${focus.map((f) => f.label).join(', ')}.`
            : 'Log your first session and the app starts aiming for you.',
      focus,
      routineId: null,
      source: 'generated',
    };
  }

  /**
   * The next day of the user's program, or null if they have no routines.
   *
   * Scoped to the default folder (or the first one) so the rotation runs over a
   * program rather than over every routine they own. `nextRoutineId` is shared
   * with `ProfileService.listRoutines`, which is what stops this card and the
   * Workout tab's `Next up` badge from ever naming different days.
   */
  private async suggestedRoutine(userId: number) {
    const [folders, routines] = await Promise.all([
      this.folderRepo.find({ where: { userId } }),
      this.routineRepo.find({ where: { userId } }),
    ]);
    if (!routines.length) return null;

    const program = folders.find((f) => f.isDefault) ?? folders[0] ?? null;
    const pool = program
      ? routines.filter((r) => r.folderId === program.id)
      : routines.filter((r) => !r.folderId);
    const candidates = pool.length ? pool : routines;

    const id = nextRoutineId(candidates);
    const row = candidates.find((r) => r.id === id);
    if (!row) return null;

    let exercises: any[] = [];
    try {
      exercises = JSON.parse(row.exercises) ?? [];
    } catch {
      exercises = [];
    }
    return {
      id: row.id,
      name: row.name,
      folderName: pool.length && program ? program.name : null,
      exercises,
    };
  }

  /**
   * Target-muscle shares for a routine, so the card's Bodygraph lights up the
   * same way it does for a generated session.
   *
   * Weighted by **set count**, not by exercise count: four sets of squats is
   * more of a leg session than one set of calf raises is a calf session.
   */
  private focusFromRoutine(exercises: any[]) {
    const counts: Record<string, number> = {};
    for (const ex of exercises) {
      const cat = this.catalog.find(ex?.exerciseId);
      if (!cat) continue;
      const sets = Array.isArray(ex?.sets) ? ex.sets.length : Number(ex?.sets) || 1;
      counts[cat.primary[0]] = (counts[cat.primary[0]] ?? 0) + sets;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([muscleId, n]) => ({
        muscleId,
        label: this.catalog.muscle(muscleId)?.label ?? muscleId,
        share: round(n / total, 2),
      }));
  }

  private titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

  // ── the 14-day block ──────────────────────────────────────────────

  private async window(userId: number, completed: GymSession[], user: User | null, now: Date) {
    const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const prevSince = new Date(now.getTime() - 2 * WINDOW_DAYS * DAY_MS);

    const inWindow = completed.filter((s) => new Date(s.completedAt) >= since);
    const inPrev = completed.filter(
      (s) => new Date(s.completedAt) >= prevSince && new Date(s.completedAt) < since,
    );

    const bw = user?.weightKg || 75;
    const volumeOf = async (list: GymSession[]) => {
      if (!list.length) return new Map<number, number>();
      const rows = await this.sets.find({
        where: { sessionId: In(list.map((s) => s.id)), isWarmup: false },
      });
      const per = new Map<number, number>();
      for (const s of rows) {
        const ex = s.exerciseId ? this.catalog.find(s.exerciseId) : undefined;
        // Bodyweight movements carry the athlete; counting them as 0 kg would
        // make a calisthenics week look like a rest week.
        const load = effectiveLoad(s.weightKg, ex?.equipment ?? '', bw);
        per.set(s.sessionId, (per.get(s.sessionId) ?? 0) + load * (s.actualReps || 0));
      }
      return per;
    };

    const perSession = await volumeOf(inWindow);
    const prevPerSession = await volumeOf(inPrev);
    const volumeKg = Array.from(perSession.values()).reduce((a, b) => a + b, 0);
    const prevVolume = Array.from(prevPerSession.values()).reduce((a, b) => a + b, 0);

    const durationMin = inWindow.reduce((n, s) => {
      const ms = new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime();
      // A session left open for a day and finished later is not a 26-hour
      // workout; clamp rather than let one bad row dominate the stat.
      return n + Math.min(Math.max(ms, 0) / 60000, 180);
    }, 0);

    const records = await this.prs.count({ where: { userId, createdAt: MoreThanOrEqual(since) } });

    const weightLogs = await this.weights.find({ where: { userId }, order: { date: 'DESC' }, take: 60 });
    const latest = weightLogs[0] ?? null;
    const before = weightLogs.find((w) => Date.parse(w.date) < since.getTime()) ?? null;

    const volumeTrendPct = prevVolume > 0 ? (volumeKg - prevVolume) / prevVolume : null;

    return {
      workouts: inWindow.length,
      volumeKg: round(volumeKg),
      volumeTrendPct: volumeTrendPct === null ? null : round(volumeTrendPct * 100, 1),
      trendLabel:
        volumeTrendPct === null
          ? inWindow.length
            ? 'Getting started'
            : 'No sessions yet'
          : volumeTrendPct > TREND_BAND
            ? 'Progressive Overload'
            : volumeTrendPct < -TREND_BAND
              ? 'Backing Off'
              : 'Holding Steady',
      // Oldest → newest, so the sparkline reads left to right like a chart.
      // Sorted on `completedAt` rather than reversing the query's order: two
      // sessions finished in the same second come back in an arbitrary order,
      // and reversing that drew the trend line backwards.
      sparkline: inWindow
        .slice()
        .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
        .map((s) => round(perSession.get(s.id) ?? 0)),
      durationMin: round(durationMin),
      records,
      calories: round((TRAINING_MET * 3.5 * bw * durationMin) / 200),
      bodyweight: latest
        ? {
            kg: round(latest.weightKg, 1),
            trendKg: before ? round(latest.weightKg - before.weightKg, 1) : null,
            loggedOn: latest.date,
          }
        : user?.weightKg
          ? { kg: round(user.weightKg, 1), trendKg: null, loggedOn: '' }
          : null,
    };
  }
}

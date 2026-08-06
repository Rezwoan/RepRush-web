import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { GymSession } from '../workouts/gym-session.entity';
import { WorkoutSet } from '../workouts/workout-set.entity';
import { PersonalRecord } from '../workouts/personal-record.entity';
import { BodyWeightLog } from '../body-weight/body-weight-log.entity';
import { CatalogService } from '../exercises/catalog.service';
import { RanksService } from '../ranks/ranks.service';
import { effectiveLoad } from '../ranks/e1rm';
import {
  FRESH_BELOW,
  FatigueSet,
  MuscleFatigue,
  RecoveryStatus,
  fatigueByMuscle,
  readinessOf,
  statusOf,
} from '../ranks/recovery';

/** The Last-14-Workouts block's window, and the comparison window behind it. */
const WINDOW_DAYS = 14;

/** Beyond this a set has decayed to nothing, so there is no point loading it. */
const RECOVERY_LOOKBACK_DAYS = 14;

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

export interface HomeSummary {
  user: { name: string; avatarId: string | null; streak: number; bestStreak: number };
  today: {
    state: 'resume' | 'start';
    sessionId: number | null;
    title: string;
    subtitle: string;
    focus: { muscleId: string; label: string; share: number }[];
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
    const recovery = await this.recovery(userId, sessions, now);
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

  /**
   * A day counts if a tracked workout was completed on it (SPEC §10).
   *
   * Today not being trained yet does not break the streak — it only breaks once
   * a whole day has been missed, so the count doesn't read as 0 every morning.
   * Freezes are P11's; this is the plain rule underneath them.
   */
  private streaks(completed: GymSession[], now: Date) {
    const days = Array.from(new Set(completed.map((s) => dayKey(new Date(s.completedAt))))).sort();
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

  // ── recovery ──────────────────────────────────────────────────────

  private muscleSizes(): Record<string, number> {
    return Object.fromEntries(this.catalog.muscles.map((m) => [m.id, m.size]));
  }

  private async recovery(userId: number, sessions: GymSession[], now: Date) {
    const since = new Date(now.getTime() - RECOVERY_LOOKBACK_DAYS * DAY_MS);
    const recent = sessions.filter((s) => new Date(s.startedAt) >= since).map((s) => s.id);

    const rows = recent.length
      ? await this.sets.find({ where: { sessionId: In(recent), isWarmup: false } })
      : [];

    const inputs: FatigueSet[] = [];
    for (const s of rows) {
      const ex = s.exerciseId ? this.catalog.find(s.exerciseId) : undefined;
      if (!ex || !s.actualReps) continue; // unmapped v1 rows train no known muscle
      inputs.push({
        primary: ex.primary,
        secondary: ex.secondary,
        reps: s.actualReps,
        rpe: s.rpe ?? null,
        ageHours: (now.getTime() - new Date(s.loggedAt).getTime()) / (60 * 60 * 1000),
      });
    }

    const sizes = this.muscleSizes();
    const byMuscle = fatigueByMuscle(inputs, sizes);
    const readiness = readinessOf(byMuscle, sizes);
    const status = statusOf(readiness);

    const fresh = this.catalog.muscles
      .filter((m) => (byMuscle[m.id]?.fatigue ?? 0) < FRESH_BELOW)
      .sort((a, b) => b.size - a.size)
      .slice(0, 3)
      .map((m) => m.label);

    return {
      readiness: round(readiness, 3),
      status,
      headline: this.recoveryCopy(status, fresh),
      fresh,
      fatigue: Object.fromEntries(
        Object.entries(byMuscle).map(([id, f]: [string, MuscleFatigue]) => [id, round(f.fatigue, 3)]),
      ),
    };
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

    const groups = Array.from(new Set(candidates.map((m) => m.group)));
    const title = groups.length ? this.titleCase(groups.join(' & ')) : "Today's Workout";

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
    };
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
      sparkline: inWindow
        .slice()
        .reverse()
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

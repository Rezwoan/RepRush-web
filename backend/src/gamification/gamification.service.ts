import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { GymSession } from '../workouts/gym-session.entity';
import { WorkoutSet } from '../workouts/workout-set.entity';
import { CatalogService } from '../exercises/catalog.service';
import { RanksService } from '../ranks/ranks.service';
import { XP, levelFromXp } from '../profile/xp';
import { RewardClaim } from './claim.entity';
import {
  DAILY_QUESTS,
  MEDAL_CATEGORIES,
  MEDAL_MATERIALS,
  WEEKLY_QUESTS,
  __selfcheck,
  dayKey,
  isoWeek,
  medalProgress,
  pick,
  sessionSpark,
  streakWithFreezes,
  type QuestDef,
} from './rules';

/** Referral quests (SPEC §8) — P9 showed them; this is what makes CLAIM real. */
const REFERRAL_QUESTS: QuestDef[] = [
  { id: 'refer-1', label: 'Refer 1 friend', target: 1, xp: 100, currency: 25, metric: 'workouts' },
  { id: 'refer-3', label: 'Refer 3 friends', target: 3, xp: 300, currency: 100, metric: 'workouts' },
  { id: 'refer-5', label: 'Refer 5 friends', target: 5, xp: 500, currency: 200, metric: 'workouts' },
];

export interface Measured {
  workouts: number;
  sets: number;
  volume: number;
  minutes: number;
  records: number;
  rankUps: number;
  muscles: number;
  streak: number;
}

@Injectable()
export class GamificationService implements OnModuleInit {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(GymSession) private sessions: Repository<GymSession>,
    @InjectRepository(WorkoutSet) private sets: Repository<WorkoutSet>,
    @InjectRepository(RewardClaim) private claims: Repository<RewardClaim>,
    private catalog: CatalogService,
    private ranks: RanksService,
  ) {}

  onModuleInit() {
    __selfcheck();
    this.logger.log('GamificationService: streaks ok, medals ok, quests ok');
  }

  // ── the one read every screen uses ────────────────────────────────

  async summary(userId: number) {
    let user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const sessions = await this.sessions.find({
      where: { userId, completedAt: Not(IsNull()) },
      order: { completedAt: 'ASC' },
    });
    const sets = sessions.length
      ? await this.sets.find({ where: { sessionId: In(sessions.map((s) => s.id)) } })
      : [];
    const now = new Date();
    const today = dayKey(now);
    const week = isoWeek(now);
    const streak = streakWithFreezes(
      sessions.map((s) => dayKey(new Date(s.completedAt))),
      today,
    );

    // Pay for anything finished since the last look, then read the claims —
    // in that order, so the balance shown already includes it.
    const awarded = await this.awardPendingSessions(userId, sessions, streak.current);
    const claims = await this.claims.find({ where: { userId } });
    if (awarded) user = await this.users.findOne({ where: { id: userId } });

    const lifetime = this.measure(sessions, sets, streak.current, () => true);
    const daily = this.measure(sessions, sets, streak.current, (s) => dayKey(new Date(s.completedAt)) === today);
    const weekly = this.measure(sessions, sets, streak.current, (s) => isoWeek(new Date(s.completedAt)) === week);

    // Rank-ups are the rank engine's business — it already records the instant
    // each band was crossed, so the quest counts those rather than guessing.
    // Without this the weekly `Rank up once` quest sat at 0/1 forever.
    const { rankUps } = await this.ranks.overview(userId);
    lifetime.rankUps = rankUps.length;
    daily.rankUps = rankUps.filter((at) => dayKey(new Date(at)) === today).length;
    weekly.rankUps = rankUps.filter((at) => isoWeek(new Date(at)) === week).length;
    const referred = await this.users.count({ where: { referredByUserId: userId } });

    // XP is training XP (derived, exactly as the post-session chain shows it)
    // plus whatever has actually been claimed. Nothing else is stored.
    const trainingXp =
      lifetime.workouts * XP.perWorkout +
      lifetime.minutes * XP.perMinute +
      lifetime.records * XP.perRecord +
      streak.best * XP.perStreakDay;
    const claimedXp = claims.reduce((n, c) => n + c.xp, 0);
    const level = levelFromXp(trainingXp + claimedXp);

    const claimed = new Set(claims.map((c) => c.key));
    const quest = (def: QuestDef, key: string, value: number) => ({
      ...def,
      key,
      progress: Math.min(value, def.target),
      done: value >= def.target,
      claimed: claimed.has(key),
    });

    const quests = {
      daily: pick(DAILY_QUESTS, `${userId}:${today}`, 1).map((q) =>
        quest(q, `quest:daily:${today}:${q.id}`, daily[q.metric]),
      ),
      weekly: pick(WEEKLY_QUESTS, `${userId}:${week}`, 3).map((q) =>
        quest(q, `quest:weekly:${week}:${q.id}`, weekly[q.metric]),
      ),
      referral: REFERRAL_QUESTS.map((q) => quest(q, `referral:${q.id}`, referred)),
      // Both timers are derived from the clock, not from a stored expiry.
      dailyEndsAt: new Date(new Date(now).setHours(24, 0, 0, 0)).toISOString(),
      weeklyEndsAt: this.nextWeekStart(now).toISOString(),
    };

    const medals = MEDAL_CATEGORIES.map((c) => {
      const value = {
        workouts: lifetime.workouts,
        volume: lifetime.volume,
        level: level.level,
        streak: streak.best,
        quests: claims.filter((x) => x.key.startsWith('quest:')).length,
      }[c.id];
      const p = medalProgress(c, value ?? 0);
      return {
        ...c,
        value: value ?? 0,
        ...p,
        materials: MEDAL_MATERIALS,
      };
    });

    // A level is claimable once reached and not yet taken. Level 1 is where
    // everyone starts, so there is nothing to claim for it.
    const levelRewards = Array.from({ length: Math.max(0, level.level - 1) }, (_, i) => {
      const n = i + 2;
      return {
        level: n,
        key: `level:${n}`,
        xp: 0,
        currency: 50 * n,
        claimed: claimed.has(`level:${n}`),
      };
    });

    return {
      level,
      currency: user.currency ?? 0,
      streak,
      quests,
      medals,
      equippedMedals: this.equipped(user),
      levelRewards,
      lifetime,
      /** What the post-session banner shows (SPEC §10 → Currency). */
      sessionSpark: sessionSpark(streak.current),
      /** Spark paid out for sessions finished since the last look. */
      justAwarded: awarded,
    };
  }

  private equipped(user: User): string[] {
    try {
      const parsed = JSON.parse(user.equippedMedals ?? '[]');
      return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    } catch {
      return [];
    }
  }

  /**
   * Everything a quest can count, over whichever sessions the filter keeps.
   *
   * One pass for daily, weekly and lifetime rather than three queries: the
   * sessions are already in memory, and the difference between the windows is
   * only which ones are included.
   */
  private measure(
    sessions: GymSession[],
    allSets: WorkoutSet[],
    streak: number,
    keep: (s: GymSession) => boolean,
  ): Measured {
    const bySession = new Map<number, WorkoutSet[]>();
    for (const s of allSets) {
      const list = bySession.get(s.sessionId) ?? [];
      list.push(s);
      bySession.set(s.sessionId, list);
    }

    // Records need the *whole* history in order, even when the window is one
    // day: what counts as a record depends on everything before it.
    const best = new Map<string, number>();
    const recordsBySession = new Map<number, number>();
    for (const session of sessions) {
      const top = new Map<string, number>();
      for (const s of bySession.get(session.id) ?? []) {
        if (s.isWarmup) continue;
        const e1rm = s.weightKg * (1 + Math.min(s.actualReps, 12) / 30);
        top.set(s.exerciseName, Math.max(top.get(s.exerciseName) ?? 0, e1rm));
      }
      let count = 0;
      for (const [name, e1rm] of Array.from(top.entries())) {
        const previous = best.get(name) ?? 0;
        if (previous > 0 && e1rm > previous) count++;
        if (e1rm > previous) best.set(name, e1rm);
      }
      recordsBySession.set(session.id, count);
    }

    const kept = sessions.filter(keep);
    const muscles = new Set<string>();
    let sets = 0;
    let volume = 0;
    let minutes = 0;
    let records = 0;

    for (const session of kept) {
      minutes += Math.max(
        0,
        (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000,
      );
      records += recordsBySession.get(session.id) ?? 0;
      for (const s of bySession.get(session.id) ?? []) {
        if (s.isWarmup) continue;
        sets++;
        volume += s.weightKg * s.actualReps;
        const ex = s.exerciseId ? this.catalog.find(s.exerciseId) : undefined;
        for (const m of ex?.primary ?? []) muscles.add(m);
      }
    }

    return {
      workouts: kept.length,
      sets,
      volume: Math.round(volume),
      minutes: Math.round(minutes),
      records,
      // Filled in by the caller from the rank engine — a session's sets do not
      // know whether they crossed a band.
      rankUps: 0,
      muscles: muscles.size,
      streak,
    };
  }

  private nextWeekStart(d: Date) {
    const next = new Date(d);
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() + ((8 - (next.getDay() || 7)) % 7 || 7));
    return next;
  }

  // ── claiming ──────────────────────────────────────────────────────

  /**
   * Take a reward. Idempotent by construction: the unique index on
   * (userId, key) means a replayed claim — an outbox retry, a double tap —
   * fails the insert rather than paying twice.
   */
  async claim(userId: number, key: string) {
    const summary = await this.summary(userId);
    const all = [
      ...summary.quests.daily,
      ...summary.quests.weekly,
      ...summary.quests.referral,
    ];
    const quest = all.find((q) => q.key === key);
    const levelReward = summary.levelRewards.find((l) => l.key === key);
    const reward = quest ?? levelReward;

    if (!reward) throw new NotFoundException('No such reward');
    if ('done' in reward && !reward.done) throw new BadRequestException('Not finished yet');
    if (reward.claimed) throw new BadRequestException('Already claimed');

    try {
      await this.claims.save(
        this.claims.create({ userId, key, xp: reward.xp, currency: reward.currency }),
      );
    } catch (err) {
      // The unique index did its job — somebody claimed this a moment ago.
      this.logger.warn(`duplicate claim ${key} for user ${userId}`);
      return this.summary(userId);
    }

    const user = await this.users.findOne({ where: { id: userId } });
    await this.users.update(userId, { currency: (user.currency ?? 0) + reward.currency });
    return this.summary(userId);
  }

  /** The three medals shown on your public profile (SPEC §10 → Your Display). */
  async equipMedals(userId: number, ids: string[]) {
    const valid = (Array.isArray(ids) ? ids : [])
      .filter((id) => MEDAL_CATEGORIES.some((c) => id.startsWith(`${c.id}:`)))
      .slice(0, 3);
    await this.users.update(userId, { equippedMedals: JSON.stringify(valid) });
    return this.summary(userId);
  }

  /**
   * Pay the per-session Spark for any finished session that has not been paid
   * for yet (SPEC §10 → Currency).
   *
   * Pulled rather than pushed: `WorkoutsService` does not call this, because
   * Workouts → Gamification → Push → Workouts is a module cycle, and because a
   * session finished offline is completed by the outbox hours later. Keyed by
   * session id, so a replayed completion — or two devices syncing the same
   * queue — cannot pay twice.
   */
  private async awardPendingSessions(userId: number, sessions: GymSession[], streak: number) {
    const unpaid = sessions.filter((s) => s.tracked !== false);
    if (!unpaid.length) return 0;

    const keys = unpaid.map((s) => `session:${s.id}`);
    const paid = new Set(
      (await this.claims.find({ where: { userId, key: In(keys) } })).map((c) => c.key),
    );
    const owed = unpaid.filter((s) => !paid.has(`session:${s.id}`));
    if (!owed.length) return 0;

    const amount = sessionSpark(streak);
    let granted = 0;
    for (const session of owed) {
      try {
        await this.claims.save(
          this.claims.create({ userId, key: `session:${session.id}`, xp: 0, currency: amount }),
        );
        granted += amount;
      } catch {
        // The unique index caught a race. Somebody else already paid for it.
      }
    }
    if (granted) {
      const user = await this.users.findOne({ where: { id: userId } });
      await this.users.update(userId, { currency: (user.currency ?? 0) + granted });
    }
    return granted;
  }

  // ── notifications (SPEC §10) ──────────────────────────────────────
  //
  // There is no cron here. The evening reminder already exists in
  // `PushService.workoutReminder` and already runs at the right hour for
  // exactly the right people; P11 made its copy streak-aware instead of adding
  // a second job that would push twice on the same evening for the same reason.
}

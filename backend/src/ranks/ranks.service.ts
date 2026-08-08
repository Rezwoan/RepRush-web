import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogService, CatalogExercise } from '../exercises/catalog.service';
import { User } from '../users/user.entity';
import { GymSession } from '../workouts/gym-session.entity';
import { WorkoutSet } from '../workouts/workout-set.entity';
import { e1rm, effectiveLoad, __selfcheck as e1rmSelfCheck } from './e1rm';
import { __selfcheck as generatorSelfCheck } from '../workouts/generator';
import {
  FRESH_BELOW,
  FatigueSet,
  MuscleFatigue,
  RecoveryStatus,
  fatigueByMuscle,
  readinessOf,
  statusOf,
  __selfcheck as recoverySelfCheck,
} from './recovery';
import {
  Rank,
  UNRANKED,
  ageFactor,
  baseMuscleIds,
  bodyweightFraction,
  medianRatio,
  nextDivisionPercentile,
  overrideIds,
  percentileFor,
  rankFromPercentile,
  ratioForPercentile,
  rankValue,
  __selfcheck as standardsSelfCheck,
} from './standards';

/** Exercises that must be ranked before the real Bodyrank unlocks (SPEC §6). */
export const PLACEMENTS_REQUIRED = 10;

/** Assumed bodyweight when a user has never logged one. Roughly a median adult. */
const DEFAULT_BODYWEIGHT_KG = 75;

/** A muscle starts bleeding LP once it has gone this long untrained. */
const DECAY_GRACE_DAYS = 30;
const DECAY_PER_WEEK = 0.015;
const DECAY_FLOOR = 0.4;

/** Rank-value a single set can contribute to league LP. A whole tier is 303. */
const LP_CLAMP_PER_SET = 150;

/** Beyond this a set has decayed to nothing, so there is no point loading it. */
const RECOVERY_LOOKBACK_DAYS = 14;

/** League division shape (SPEC §6): ~30 rivals, top promote, bottom demote. */
const LEAGUE_SIZE = 30;
const LEAGUE_PROMOTE = 5;
const LEAGUE_DEMOTE = 5;

/** Monday 00:00 UTC after the given instant — when the league resets. */
function nextWeekStart(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + ((8 - (d.getUTCDay() || 7)) % 7 || 7));
  return d;
}

/** ISO-8601 week label, e.g. `2026-W32`. The season id, since a season is a week. */
function isoWeek(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // to that week's Thursday
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface ExerciseRank {
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  rank: Rank;
  bestE1rm: number;
  bestWeightKg: number;
  bestReps: number;
  lastTrainedAt: string;
  sets: number;
  /** The set that promotes you. Null at the top of the ladder. */
  next: NextTarget | null;
}

export interface NextTarget {
  percentile: number;
  rank: Rank;
  weightKg: number | null;
  reps: number;
  progress: number;
}

export interface MuscleRank {
  muscleId: string;
  label: string;
  group: string;
  view: string;
  size: number;
  rank: Rank;
  exercises: number;
  lastTrainedAt: string | null;
  /** Fraction of the earned percentile currently withheld by decay, 0–1. */
  decay: number;
}

export interface Bodyrank {
  rank: Rank;
  /** True while placements are incomplete — the badge is greyed and reads "Predicted". */
  predicted: boolean;
  placements: { done: number; required: number };
  musclesTrained: number;
  weeklyLp: number;
}

/** One rung of the weekly ladder (SPEC §6 → Leagues). */
export interface LeagueRow {
  userId: number;
  name: string;
  username: string | null;
  avatarId: string | null;
  profileImage: string | null;
  weeklyLp: number;
  rank: Rank;
  you: boolean;
}

/**
 * The rank engine.
 *
 * `ponytail:` every rank is recomputed from `workout_sets` on read — there is no
 * ExerciseRank/MuscleRank/LpEvent table and no nightly decay job. A rank is a
 * pure function of the sets plus the profile, so storing it would only create
 * something that can disagree with the sets, and keeping it honest would need
 * both a backfill and a cron. The whole database is ~800 sets and already lives
 * in memory (sql.js). Ceiling: if one user ever passes ~50k sets, cache the
 * per-exercise bests in a table keyed by (user, exercise) and invalidate on
 * write. None of the maths below changes.
 */
@Injectable()
export class RanksService implements OnModuleInit {
  private readonly logger = new Logger(RanksService.name);

  constructor(
    private catalog: CatalogService,
    @InjectRepository(WorkoutSet) private sets: Repository<WorkoutSet>,
    @InjectRepository(GymSession) private sessions: Repository<GymSession>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  /**
   * Self-checks run at boot rather than in a test framework, per this project's
   * convention. They are pure functions over constants: if one fails the build
   * is wrong and should say so loudly rather than quietly mis-rank everybody.
   */
  onModuleInit() {
    this.logger.log(
      [e1rmSelfCheck(), standardsSelfCheck(), recoverySelfCheck(), generatorSelfCheck()].join(', '),
    );

    const missing = overrideIds().filter((id) => !this.catalog.find(id));
    if (missing.length) throw new Error(`standards.ts overrides name unknown exercises: ${missing.join(', ')}`);

    const bases = new Set(baseMuscleIds());
    const unscored = this.catalog.muscles.filter((m) => !bases.has(m.id));
    if (unscored.length) {
      throw new Error(`no strength standard for muscle(s): ${unscored.map((m) => m.id).join(', ')}`);
    }
  }

  // ── scoring one lift ────────────────────────────────────────────

  /** How much load an exercise actually puts through its target muscle. */
  private load(ex: CatalogExercise, weightKg: number, bodyweightKg: number): number {
    return ex.equipment === 'bodyweight'
      ? effectiveLoad(weightKg, 'bodyweight', bodyweightKg) * bodyweightFraction(ex.primary[0])
      : weightKg || 0;
  }

  /**
   * Score one performance. This is the entire engine, and the standalone Rank
   * Calculator (SPEC §6) calls exactly this with numbers typed by hand.
   */
  score(
    exercise: CatalogExercise,
    weightKg: number,
    reps: number,
    bodyweightKg: number,
    sex: string | null,
    age: number | null,
  ): { rank: Rank; e1rm: number } {
    const bw = bodyweightKg > 0 ? bodyweightKg : DEFAULT_BODYWEIGHT_KG;
    const estimated = e1rm(this.load(exercise, weightKg, bw), reps);
    if (!estimated) return { rank: UNRANKED, e1rm: 0 };

    const group = this.catalog.muscle(exercise.primary[0])?.group ?? null;
    const ratio = (estimated / bw) * ageFactor(age);
    return {
      rank: rankFromPercentile(percentileFor(ratio, medianRatio(exercise, sex, group))),
      e1rm: Math.round(estimated * 10) / 10,
    };
  }

  // ── a user's whole picture, from one pass over their sets ───────

  private ageOf(user: User): number | null {
    if (!user.birthDate) return null;
    const born = new Date(user.birthDate);
    if (isNaN(born.getTime())) return null;
    return Math.floor((Date.now() - born.getTime()) / (365.25 * 24 * 3600 * 1000));
  }

  /** Non-warmup, catalog-mapped, non-zero sets for one user, oldest first. */
  private qualifyingSets(userId: number): Promise<WorkoutSet[]> {
    return this.sets
      .createQueryBuilder('s')
      .innerJoin('gym_sessions', 'g', 'g.id = s.sessionId')
      .where('g.userId = :userId', { userId })
      .andWhere('s.exerciseId IS NOT NULL')
      .andWhere('s.isWarmup = :warmup', { warmup: false })
      .andWhere('s.actualReps > 0')
      .orderBy('s.loggedAt', 'ASC')
      .getMany();
  }

  /**
   * One read of the database, everything derived from it. Exercise ranks and
   * weekly LP fall out of the same chronological pass: LP is the rank-value
   * gained the moment a personal best improved, so it needs the sets in order
   * anyway.
   */
  private async snapshot(userId: number) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const bw = user.weightKg > 0 ? user.weightKg : DEFAULT_BODYWEIGHT_KG;
    const age = this.ageOf(user);
    const rows = await this.qualifyingSets(userId);
    const since = Date.now() - 7 * 86400000;

    const best = new Map<
      string,
      { weightKg: number; reps: number; e1rm: number; rank: Rank; count: number; lastAt: Date }
    >();
    let weeklyLp = 0;
    /** ISO timestamps at which a band was crossed — SPEC §6's "Number of Rank Ups". */
    const rankUps: string[] = [];

    for (const s of rows) {
      const ex = this.catalog.find(s.exerciseId);
      if (!ex) continue;
      const estimated = e1rm(this.load(ex, s.weightKg, bw), s.actualReps);
      if (!estimated) continue;

      const at = new Date(s.loggedAt);
      const prev = best.get(s.exerciseId);
      if (prev && estimated <= prev.e1rm) {
        best.set(s.exerciseId, { ...prev, count: prev.count + 1, lastAt: at });
        continue;
      }

      const rank = this.score(ex, s.weightKg, s.actualReps, bw, user.sex, age).rank;
      const value = rankValue(rank);
      // A new personal best. The clamp is on league LP only — never on the rank
      // itself, or one honest heavy first session would peg the user low for
      // months (SPEC §6 asks for the clamp; it belongs here, not on the ladder).
      if (at.getTime() >= since) weeklyLp += Math.min(LP_CLAMP_PER_SET, value - rankValue(prev?.rank));
      // A heavier PB inside the same division is progress, not a rank-up. First
      // time an exercise ranks at all counts: it came from nothing.
      if (!prev || prev.rank.tier !== rank.tier || prev.rank.division !== rank.division) {
        rankUps.push(at.toISOString());
      }
      best.set(s.exerciseId, {
        weightKg: s.weightKg,
        reps: s.actualReps,
        e1rm: estimated,
        rank,
        count: (prev?.count ?? 0) + 1,
        lastAt: at,
      });
    }

    const exercises: ExerciseRank[] = Array.from(best.entries())
      .map(([exerciseId, b]) => {
        const ex = this.catalog.find(exerciseId);
        return {
          exerciseId,
          name: ex.name,
          primaryMuscle: ex.primary[0],
          equipment: ex.equipment,
          rank: b.rank,
          bestE1rm: Math.round(b.e1rm * 10) / 10,
          bestWeightKg: b.weightKg,
          bestReps: b.reps,
          lastTrainedAt: b.lastAt.toISOString(),
          sets: b.count,
          next: this.nextRankTarget(exerciseId, b.rank.percentile, bw, user.sex, age, b.reps),
        };
      })
      .sort((a, b) => rankValue(b.rank) - rankValue(a.rank));

    return { user, bw, age, rows, exercises, rankUps, weeklyLp: Math.round(weeklyLp) };
  }

  async exerciseRanks(userId: number): Promise<ExerciseRank[]> {
    return (await this.snapshot(userId)).exercises;
  }

  /**
   * Muscle ranks, decayed.
   *
   * Compounds count double: a muscle carried by a heavy row says more about it
   * than one carried by a cable fly. Everything stays in percentile space until
   * the final step — averaging tier labels would be meaningless, and decay has
   * to apply to something continuous.
   */
  private computeMuscles(exercises: ExerciseRank[]): MuscleRank[] {
    const byMuscle = new Map<string, { sum: number; weight: number; count: number; lastAt: Date }>();
    for (const r of exercises) {
      const ex = this.catalog.find(r.exerciseId);
      const weight = ex.mechanic === 'compound' ? 2 : 1;
      const acc = byMuscle.get(r.primaryMuscle) ?? { sum: 0, weight: 0, count: 0, lastAt: null };
      const at = new Date(r.lastTrainedAt);
      byMuscle.set(r.primaryMuscle, {
        sum: acc.sum + r.rank.percentile * weight,
        weight: acc.weight + weight,
        count: acc.count + 1,
        lastAt: !acc.lastAt || at > acc.lastAt ? at : acc.lastAt,
      });
    }

    return this.catalog.muscles.map((m) => {
      const acc = byMuscle.get(m.id);
      const base = { muscleId: m.id, label: m.label, group: m.group, view: m.view, size: m.size };
      if (!acc) return { ...base, rank: UNRANKED, exercises: 0, lastTrainedAt: null, decay: 0 };
      const decay = this.decayFactor(acc.lastAt);
      return {
        ...base,
        rank: rankFromPercentile((acc.sum / acc.weight) * decay),
        exercises: acc.count,
        lastTrainedAt: acc.lastAt.toISOString(),
        decay: Math.round((1 - decay) * 100) / 100,
      };
    });
  }

  async muscleRanks(userId: number): Promise<MuscleRank[]> {
    return this.computeMuscles((await this.snapshot(userId)).exercises);
  }

  /**
   * Rank decay. A muscle untrained past the grace period bleeds slowly and stops
   * at a floor — the Bodygraph is meant to be honest, not punitive. Training it
   * once restores the full score immediately, because nothing was ever written
   * down to un-write.
   */
  private decayFactor(lastAt: Date | null): number {
    if (!lastAt) return 1;
    const days = (Date.now() - lastAt.getTime()) / 86400000;
    if (days <= DECAY_GRACE_DAYS) return 1;
    return Math.max(DECAY_FLOOR, 1 - DECAY_PER_WEEK * ((days - DECAY_GRACE_DAYS) / 7));
  }

  /**
   * Bodyrank — the headline number.
   *
   * Once placements are done, untrained muscles count as zero, weighted by
   * size. That is the whole point: a chest-and-arms lifter should not read
   * Diamond overall, and the grey regions on the Bodygraph are the reason why.
   * Before placements the average covers only what has been trained, and the
   * result is flagged `predicted` so the UI greys the badge.
   */
  async bodyrank(userId: number): Promise<Bodyrank> {
    return (await this.overview(userId)).bodyrank;
  }

  /** Everything the Ranks tab needs, from a single pass over the sets. */
  async overview(userId: number): Promise<{
    bodyrank: Bodyrank;
    muscles: MuscleRank[];
    exercises: ExerciseRank[];
    rankUps: string[];
    categories: { category: string; rank: Rank; count: number }[];
  }> {
    const snap = await this.snapshot(userId);
    const muscles = this.computeMuscles(snap.exercises);
    const trained = muscles.filter((m) => m.exercises > 0);
    const done = snap.exercises.length;
    const predicted = done < PLACEMENTS_REQUIRED;

    const pool = predicted ? trained : muscles;
    const totalSize = pool.reduce((n, m) => n + m.size, 0);
    const percentile = totalSize ? pool.reduce((n, m) => n + m.rank.percentile * m.size, 0) / totalSize : 0;

    return {
      bodyrank: {
        rank: done ? rankFromPercentile(percentile) : UNRANKED,
        predicted,
        placements: { done: Math.min(done, PLACEMENTS_REQUIRED), required: PLACEMENTS_REQUIRED },
        musclesTrained: trained.length,
        weeklyLp: snap.weeklyLp,
      },
      muscles,
      exercises: snap.exercises,
      rankUps: snap.rankUps,
      categories: this.averageByCategory(snap.exercises),
    };
  }

  /**
   * Analysis → Average Ranks (SPEC §6): one rank per catalog category.
   *
   * Done here rather than on the client for the same reason muscle ranks are:
   * the average has to happen in percentile space and then meet the ladder
   * once, and the ladder lives in `standards.ts`. A second copy of TIER_FLOOR
   * in the frontend is a copy that can drift.
   */
  private averageByCategory(exercises: ExerciseRank[]): { category: string; rank: Rank; count: number }[] {
    const by = new Map<string, number[]>();
    for (const r of exercises) {
      const category = this.catalog.find(r.exerciseId)?.category ?? 'other';
      const list = by.get(category);
      if (list) list.push(r.rank.percentile);
      else by.set(category, [r.rank.percentile]);
    }
    return Array.from(by.entries())
      .map(([category, ps]) => ({
        category,
        rank: rankFromPercentile(ps.reduce((n, p) => n + p, 0) / ps.length),
        count: ps.length,
      }))
      .sort((a, b) => b.count - a.count || rankValue(b.rank) - rankValue(a.rank));
  }

  // ── leagues ─────────────────────────────────────────────────────

  /**
   * The weekly ladder (SPEC §6).
   *
   * `ponytail:` no `season` / `division` tables and no reset job. A season *is*
   * the ISO week, a division *is* your slice of everyone sorted by the LP they
   * earned in it, and both fall out of the same weekly-LP number the Bodyrank
   * card already shows. A stored ladder would need a cron to roll it over and
   * could disagree with the sets, which is the exact trap ranks avoided in P3.
   * Ceiling: this snapshots every user on every request. Past a few hundred
   * accounts, cache the per-user weekly LP for the length of the week — the
   * division maths below does not change.
   */
  async leagues(userId: number): Promise<{
    season: { week: string; endsAt: string };
    division: { index: number; size: number };
    promoteTop: number;
    demoteBottom: number;
    rows: LeagueRow[];
  }> {
    const users = await this.users.find();
    const scored = await Promise.all(
      users.map(async (u) => {
        const snap = await this.snapshot(u.id);
        return {
          userId: u.id,
          name: u.name ?? u.email,
          // What the row links to. A standings table where you cannot look at
          // the person above you is a table of strangers.
          username: u.username ?? null,
          avatarId: u.avatarId ?? null,
          profileImage: u.profileImage ?? null,
          weeklyLp: snap.weeklyLp,
          rank: rankFromPercentile(
            snap.exercises.length
              ? snap.exercises.reduce((n, e) => n + e.rank.percentile, 0) / snap.exercises.length
              : 0,
          ),
          you: u.id === userId,
        };
      }),
    );

    scored.sort((a, b) => b.weeklyLp - a.weeklyLp || a.name.localeCompare(b.name));
    const mine = Math.max(0, scored.findIndex((r) => r.you));
    const index = Math.floor(mine / LEAGUE_SIZE);
    const rows = scored.slice(index * LEAGUE_SIZE, (index + 1) * LEAGUE_SIZE);

    // A five-person division cannot promote five and demote five — everyone
    // would be in both zones at once, which is what dev actually showed. Cap
    // each zone at a third of the table so the two can never meet.
    const zone = Math.floor(rows.length / 3);

    return {
      season: { week: isoWeek(new Date()), endsAt: nextWeekStart(new Date()).toISOString() },
      division: { index, size: rows.length },
      promoteTop: Math.min(LEAGUE_PROMOTE, zone),
      demoteBottom: Math.min(LEAGUE_DEMOTE, zone),
      rows,
    };
  }

  // ── recording a lift outside a workout ──────────────────────────

  /**
   * Log one lift as a real set, with a one-set session to hang it off.
   *
   * Both callers want the same thing for the same reason: ranks are a pure
   * function of `workout_sets`, so a rank the app *shows* but never *stores a
   * set for* evaporates the moment the screen closes. Onboarding's first lift
   * and the Calculator's `Save Rank` toggle are the same operation.
   */
  async recordLift(
    userId: number,
    exerciseId: string,
    weightKg: number,
    reps: number,
    note: string,
  ): Promise<void> {
    const exercise = this.catalog.get(exerciseId); // throws on a junk id
    const session = await this.sessions.save(
      this.sessions.create({ userId, workoutType: note, completedAt: new Date(), notes: note }),
    );
    await this.sets.save(
      this.sets.create({
        sessionId: session.id,
        exerciseName: exercise.name,
        exerciseId: exercise.id,
        setNumber: 1,
        actualReps: Math.round(reps),
        weightKg,
        isWarmup: false,
      }),
    );
  }

  async exerciseDetail(userId: number, exerciseId: string) {
    const ex = this.catalog.get(exerciseId);
    const snap = await this.snapshot(userId);
    const mine = snap.exercises.find((r) => r.exerciseId === exerciseId) ?? null;
    const history = snap.rows
      .filter((s) => s.exerciseId === exerciseId)
      .map((s) => ({
        at: new Date(s.loggedAt).toISOString(),
        weightKg: s.weightKg,
        reps: s.actualReps,
        e1rm: Math.round(e1rm(this.load(ex, s.weightKg, snap.bw), s.actualReps) * 10) / 10,
      }));
    return {
      exercise: ex,
      rank: mine,
      history,
      next: this.nextRankTarget(exerciseId, mine?.rank.percentile ?? 0, snap.bw, snap.user.sex, snap.age, mine?.bestReps),
    };
  }

  // ── "TO NEXT RANK: 82.5x3" ──────────────────────────────────────

  /**
   * The set that promotes you (SPEC §5.2).
   *
   * The rank strip is the best motivator on the session screen precisely
   * because it is specific, so this runs the whole chain backwards: next
   * division's percentile → required bodyweight multiple → required e1RM →
   * the load at the rep count the user actually trains at.
   *
   * Returns null at the top of the ladder, and for bodyweight movements, where
   * "add 2.5 kg" is not the answer — those promote on reps, and the honest
   * prescription is the rep count, so that is what comes back.
   */
  nextRankTarget(
    exerciseId: string,
    percentile: number,
    bodyweightKg: number,
    sex: string | null,
    age: number | null,
    atReps?: number,
  ): NextTarget | null {
    const ex = this.catalog.find(exerciseId);
    if (!ex) return null;
    const target = nextDivisionPercentile(percentile);
    if (target === null) return null;
    // `target` is exactly the boundary, and `rankFromPercentile` floors, so at
    // 87.333… the multiply-by-three lands on 1.9999999 and the label comes back
    // as the division the user is already in — the strip read "beat 102.5×5 to
    // hit Diamond II" to someone who was Diamond II. Score a hair past it.
    const reached = rankFromPercentile(target + 1e-6);

    const group = this.catalog.muscle(ex.primary[0])?.group ?? null;
    const median = medianRatio(ex, sex, group);
    const bw = bodyweightKg > 0 ? bodyweightKg : DEFAULT_BODYWEIGHT_KG;
    // The ratio was age-adjusted on the way in, so undo that on the way out —
    // otherwise a 55-year-old is quoted a load they do not need to lift.
    const requiredE1rm = (ratioForPercentile(target, median) * bw) / ageFactor(age);

    const reps = Math.max(1, Math.min(12, atReps || Math.round((ex.repMin + ex.repMax) / 2)));
    const load = requiredE1rm / (1 + reps / 30);

    // How far through the current division they already are, for the bar.
    const from = nextDivisionPercentile(Math.max(0, percentile - 1e-6)) === target
      ? this.divisionFloor(percentile)
      : percentile;
    const progress = target > from ? Math.max(0, Math.min(1, (percentile - from) / (target - from))) : 0;

    if (ex.equipment === 'bodyweight') {
      // Solve for reps instead: the load is fixed at a fraction of bodyweight.
      const carried = bw * bodyweightFraction(ex.primary[0]);
      const needed = Math.ceil(Math.max(0, requiredE1rm / carried - 1) * 30);
      return {
        percentile: Math.round(target * 10) / 10,
        rank: reached,
        weightKg: null,
        reps: Math.max(1, Math.min(12, needed)),
        progress,
      };
    }

    return {
      percentile: Math.round(target * 10) / 10,
      rank: reached,
      // Round *up* — the prescription has to actually clear the bar it names.
      weightKg: Math.ceil(load / 2.5) * 2.5,
      reps,
      progress,
    };
  }

  /** The percentile at which the division the user is currently in began. */
  private divisionFloor(percentile: number): number {
    let lo = 0;
    let cursor = 0;
    while (true) {
      const next = nextDivisionPercentile(cursor);
      if (next === null || next > percentile) return lo;
      lo = next;
      cursor = next;
    }
  }

  // ── recovery ────────────────────────────────────────────────────

  /**
   * Per-muscle fatigue right now.
   *
   * Lives here rather than in HomeService because the Home tab's Recovery Zone
   * and the workout generator have to agree — a card that says "quads are
   * fresh" beside a generator that refuses to program them is worse than
   * either being wrong on its own.
   */
  async recovery(userId: number): Promise<{
    readiness: number;
    status: RecoveryStatus;
    fresh: string[];
    fatigue: Record<string, number>;
  }> {
    const since = new Date(Date.now() - RECOVERY_LOOKBACK_DAYS * 86400000);
    const rows = await this.sets
      .createQueryBuilder('s')
      .innerJoin('gym_sessions', 'g', 'g.id = s.sessionId')
      .where('g.userId = :userId', { userId })
      .andWhere('s.isWarmup = :warmup', { warmup: false })
      .andWhere('s.loggedAt >= :since', { since: since.toISOString() })
      .getMany();

    const now = Date.now();
    const inputs: FatigueSet[] = [];
    for (const s of rows) {
      const ex = s.exerciseId ? this.catalog.find(s.exerciseId) : undefined;
      if (!ex || !s.actualReps) continue; // unmapped v1 rows train no known muscle
      inputs.push({
        primary: ex.primary,
        secondary: ex.secondary,
        reps: s.actualReps,
        rpe: s.rpe ?? null,
        ageHours: (now - new Date(s.loggedAt).getTime()) / 3600000,
      });
    }

    const sizes = Object.fromEntries(this.catalog.muscles.map((m) => [m.id, m.size]));
    const byMuscle = fatigueByMuscle(inputs, sizes);
    const readiness = readinessOf(byMuscle, sizes);

    // Least-worked first, then biggest. Sorting by size alone let the copy call
    // a muscle "fresh" that had taken secondary work an hour earlier — true by
    // the threshold, but not what someone with sore glutes wants to read.
    const fresh = this.catalog.muscles
      .filter((m) => (byMuscle[m.id]?.fatigue ?? 0) < FRESH_BELOW)
      .sort((a, b) => (byMuscle[a.id]?.fatigue ?? 0) - (byMuscle[b.id]?.fatigue ?? 0) || b.size - a.size)
      .slice(0, 3)
      .map((m) => m.label);

    return {
      readiness: Math.round(readiness * 1000) / 1000,
      status: statusOf(readiness),
      fresh,
      fatigue: Object.fromEntries(
        Object.entries(byMuscle).map(([id, f]: [string, MuscleFatigue]) => [
          id,
          Math.round(f.fatigue * 1000) / 1000,
        ]),
      ),
    };
  }
}

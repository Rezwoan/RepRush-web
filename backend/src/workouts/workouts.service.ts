import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not, IsNull, In } from 'typeorm';
import { GymSession } from './gym-session.entity';
import { WorkoutSet } from './workout-set.entity';
import { PersonalRecord } from './personal-record.entity';
import { Routine } from '../profile/routine.entity';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { CatalogService } from '../exercises/catalog.service';
import { RanksService } from '../ranks/ranks.service';
import { ratioForPercentile, medianRatio, ageFactor } from '../ranks/standards';
import { e1rm } from '../ranks/e1rm';
import {
  Difficulty,
  GenExercise,
  GeneratedWorkout,
  PlannedExercise,
  LastPerformance,
  generate,
  roundLoad,
} from './generator';
import { ymd } from '../common/date.util';

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

/** Assumed bodyweight when a user has never logged one. Mirrors RanksService. */
const DEFAULT_BODYWEIGHT_KG = 75;

/** What the user's `experience` answer means to the generator's difficulty chip. */
const EXPERIENCE_DIFFICULTY: Record<string, Difficulty> = {
  never: 'beginner',
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
};

export interface GenerateOptions {
  durationMin?: number;
  difficulty?: string;
  /** Overrides the profile's stored kit — the builder's Equipment chip. */
  equipment?: string[];
  muscles?: string[];
}

const parseJsonArray = (raw: string | null | undefined): string[] | null => {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
};

@Injectable()
export class WorkoutsService implements OnModuleInit {
  private readonly logger = new Logger(WorkoutsService.name);

  constructor(
    @InjectRepository(GymSession) private sessionRepo: Repository<GymSession>,
    @InjectRepository(WorkoutSet) private setRepo: Repository<WorkoutSet>,
    @InjectRepository(PersonalRecord) private prRepo: Repository<PersonalRecord>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Routine) private routineRepo: Repository<Routine>,
    private usersService: UsersService,
    private catalog: CatalogService,
    private ranks: RanksService,
  ) {}

  // ─── Sessions ───────────────────────────────────────────────────────────────

  async startSession(
    userId: number,
    workoutType: string,
    workoutPlanId?: number,
    plan?: unknown,
    routineId?: number,
  ) {
    const session = this.sessionRepo.create({
      userId,
      workoutType,
      workoutPlanId,
      routineId: routineId ?? null,
      plan: plan ? JSON.stringify(plan) : null,
      tracked: true,
    });
    return this.sessionRepo.save(session);
  }

  /**
   * Finish a session — or throw it away if nothing was logged in it.
   *
   * An empty session is not a workout. Counting one as a training day is what
   * made the streak read a day higher than the days actually trained, and the
   * guard belongs here rather than in each of the three places that count
   * streaks: every caller — the finish screen, the offline outbox replaying
   * hours later — routes through this.
   *
   * Finishing is also the only moment a routine's rotation stamp may move. A
   * session that was started and discarded rotated the split before this.
   */
  async completeSession(
    sessionId: number,
    userId: number,
    notes?: string,
    finish?: { caption?: string; tracked?: boolean; privacy?: string },
  ) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');

    if (!(await this.setRepo.count({ where: { sessionId } }))) {
      await this.sessionRepo.delete(sessionId);
      return { id: sessionId, discarded: true };
    }

    // Completing twice must not move the clock — the outbox retries, and a
    // replayed completion would otherwise stretch the recorded duration.
    const alreadyDone = !!session.completedAt;
    if (!alreadyDone) session.completedAt = new Date();
    if (notes !== undefined) session.notes = notes;
    if (finish?.caption !== undefined) session.caption = finish.caption;
    if (finish?.tracked !== undefined) session.tracked = finish.tracked;
    if (finish?.privacy !== undefined) session.privacy = finish.privacy;
    const saved = await this.sessionRepo.save(session);

    if (!alreadyDone && session.routineId) {
      // Best effort: the session is the record, the stamp is only a hint about
      // which day to suggest next.
      await this.routineRepo
        .update({ id: session.routineId, userId }, { lastUsedAt: session.completedAt })
        .catch(() => undefined);
    }
    return saved;
  }

  /**
   * Sessions that were finished with nothing in them, from before
   * `completeSession` refused to keep one.
   *
   * ponytail: a sweep at boot rather than a migration file — there is no
   * migration runner here (`synchronize: true`), it is idempotent, and it costs
   * one query on a table that is already small. Delete it once the deployed
   * databases have been through it.
   */
  async onModuleInit() {
    try {
      const { affected } = await this.sessionRepo
        .createQueryBuilder()
        .delete()
        .where('completedAt IS NOT NULL')
        .andWhere('id NOT IN (SELECT sessionId FROM workout_sets)')
        .execute();
      if (affected) this.logger.log(`removed ${affected} completed session(s) with no sets logged`);
    } catch (err) {
      // Housekeeping must never be the reason the app will not start.
      this.logger.warn(`empty-session sweep skipped: ${err}`);
    }
  }

  // ─── The generator (SPEC §5.1) ──────────────────────────────────────────────

  /**
   * Build a session for this user, right now.
   *
   * All the judgement lives in `generator.ts`; this only gathers the inputs —
   * the profile, what is recovered, what is weakest and what they lifted last
   * time — and supplies the strength-standard estimate for lifts they have
   * never performed.
   */
  async generateWorkout(userId: number, opts: GenerateOptions = {}): Promise<GeneratedWorkout> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const [recovery, muscleRanks, history] = await Promise.all([
      this.ranks.recovery(userId),
      this.ranks.muscleRanks(userId),
      this.lastPerformances(userId),
    ]);

    const bw = user.weightKg > 0 ? user.weightKg : DEFAULT_BODYWEIGHT_KG;
    const age = user.birthDate
      ? Math.floor((Date.now() - new Date(user.birthDate).getTime()) / (365.25 * 86400000))
      : null;
    const percentile = Object.fromEntries(muscleRanks.map((m) => [m.muscleId, m.rank.percentile]));

    const difficulty = DIFFICULTIES.includes(opts.difficulty as Difficulty)
      ? (opts.difficulty as Difficulty)
      : (EXPERIENCE_DIFFICULTY[user.experience] ?? 'intermediate');

    const equipment = opts.equipment?.length ? opts.equipment : parseJsonArray(user.equipment);

    return generate({
      muscles: this.catalog.muscles.map((m) => ({ id: m.id, label: m.label, group: m.group, size: m.size })),
      fatigue: recovery.fatigue,
      percentile,
      catalog: this.catalog.list() as unknown as GenExercise[],
      equipment,
      limitations: parseJsonArray(user.limitations) ?? [],
      durationMin: Math.max(10, Math.min(180, Number(opts.durationMin) || 60)),
      difficulty,
      history,
      onlyMuscles: opts.muscles,
      estimate: (ex, reps) => this.estimateLoad(ex, reps, percentile, bw, user.sex, age),
    });
  }

  /**
   * Turn a saved routine into a session plan.
   *
   * The counterpart to `generateWorkout`, returning the *same* `GeneratedWorkout`
   * shape on purpose: the session screen, the outbox and `gym_sessions.plan` all
   * consume that shape already, so a routine-started session and a generated one
   * are indistinguishable downstream. A routine is a prescription of which
   * exercises and how many sets; the numbers still come from the user's own last
   * performance, or from the same estimate a generated session would use — never
   * from whatever was stored when the routine was written, which would go stale
   * the first time they got stronger.
   */
  async planFromRoutineId(userId: number, routineId: number) {
    const row = await this.routineRepo.findOne({ where: { id: routineId, userId } });
    if (!row) throw new NotFoundException('Routine not found');
    let exercises: any[] = [];
    try {
      exercises = JSON.parse(row.exercises) ?? [];
    } catch {
      exercises = [];
    }
    const plan = await this.fromRoutine(userId, { name: row.name, exercises });
    // Stamped here rather than at session start: the tab loads a plan the
    // moment you pick a day, and a split that rotates on *opening* a day is
    // wrong. `startSession` is where it counts — see the controller.
    return { ...plan, routineId: row.id };
  }

  async fromRoutine(userId: number, routine: { name: string; exercises: any[] }) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const [muscleRanks, history] = await Promise.all([
      this.ranks.muscleRanks(userId),
      this.lastPerformances(userId),
    ]);
    const percentile = Object.fromEntries(muscleRanks.map((m) => [m.muscleId, m.rank.percentile]));
    const bw = user.weightKg > 0 ? user.weightKg : DEFAULT_BODYWEIGHT_KG;
    const age = user.birthDate
      ? Math.floor((Date.now() - new Date(user.birthDate).getTime()) / (365.25 * 86400000))
      : null;

    const exercises: PlannedExercise[] = [];
    let estimatedSec = 0;
    const focusCount: Record<string, number> = {};

    for (const item of routine.exercises ?? []) {
      const cat = this.catalog.find(item.exerciseId);
      // A routine can outlive an exercise (a custom one deleted, a catalog id
      // that no longer resolves). Skip it rather than fail the whole session.
      if (!cat) continue;

      const restSec = Number(item.restSec) || cat.restSec || 90;
      const last = history[item.exerciseId];
      const rows: { weightKg: number | null; reps: number | null }[] =
        Array.isArray(item.sets) && item.sets.length ? item.sets : [{ weightKg: null, reps: null }];

      const planned = rows.map((row, i) => {
        // Precedence, and it matters: what the routine prescribes wins, because
        // the user wrote it down on purpose. A blank falls back to their own
        // last performance, and only then to the standards estimate — the v1
        // rule that a ghost value is a lookup, never a projection.
        const reps = row?.reps ?? last?.reps ?? Math.round((cat.repMin + cat.repMax) / 2);
        const weightKg =
          row?.weightKg ??
          last?.weightKg ??
          this.estimateLoad(cat as unknown as GenExercise, reps, percentile, bw, user.sex, age);
        return { setNumber: i + 1, isWarmup: false, targetReps: reps, weightKg };
      });

      exercises.push({
        exerciseId: item.exerciseId,
        name: cat.name,
        primaryMuscle: cat.primary[0],
        equipment: cat.equipment,
        mechanic: cat.mechanic,
        restSec,
        sets: planned,
        // True when the *user's history* filled anything in — a routine that
        // prescribes its own numbers is not "from history".
        fromHistory: !!last && rows.some((r) => r?.weightKg == null),
      });

      focusCount[cat.primary[0]] = (focusCount[cat.primary[0]] ?? 0) + planned.length;
      estimatedSec += planned.length * (45 + restSec) + 60;
    }

    const totalSets = Object.values(focusCount).reduce((a, b) => a + b, 0) || 1;
    const focus = Object.entries(focusCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([muscleId, n]) => ({
        muscleId,
        label: this.catalog.muscle(muscleId)?.label ?? muscleId,
        share: n / totalSets,
      }));

    return {
      title: routine.name,
      durationMin: Math.round(estimatedSec / 60),
      estimatedSec,
      focus,
      exercises,
    };
  }

  /**
   * What to put in the weight field for a lift the user has never done.
   *
   * Their muscle's current percentile, run backwards through the same standards
   * curve the rank engine uses — i.e. "whatever on this exercise would rank you
   * where you already rank". Null when there is nothing to go on, because a
   * blank field is honest and an invented number is not.
   */
  private estimateLoad(
    ex: GenExercise,
    reps: number,
    percentile: Record<string, number>,
    bodyweightKg: number,
    sex: string | null,
    age: number | null,
  ): number | null {
    // Bodyweight movements have no load to suggest — the bar is your own mass,
    // and the field is for *added* weight.
    if (ex.equipment === 'bodyweight') return 0;
    const p = percentile[ex.primary[0]] ?? 0;
    if (!(p > 0)) return null;

    const group = this.catalog.muscle(ex.primary[0])?.group ?? null;
    const median = medianRatio(ex, sex, group);
    const requiredE1rm = (ratioForPercentile(p, median) * bodyweightKg) / ageFactor(age);
    const load = roundLoad(requiredE1rm / (1 + Math.min(reps, 12) / 30));
    return load > 0 ? load : null;
  }

  /**
   * The last working set the user performed on each exercise, keyed by catalog
   * id. This is the PREV column and the pre-filled numbers — a lookup of what
   * actually happened, never a projection of what should happen next (v1 rule).
   */
  async lastPerformances(userId: number): Promise<Record<string, LastPerformance>> {
    const rows = await this.setRepo
      .createQueryBuilder('s')
      .innerJoin('gym_sessions', 'g', 'g.id = s.sessionId')
      .where('g.userId = :userId', { userId })
      .andWhere('s.exerciseId IS NOT NULL')
      .andWhere('s.isWarmup = :warmup', { warmup: false })
      .orderBy('s.loggedAt', 'ASC')
      .getMany();

    // Group by exercise *and* session so "sets" is how many they did that day,
    // not how many they have ever done.
    const bySession = new Map<string, { sessionId: number; sets: WorkoutSet[] }>();
    for (const s of rows) {
      const key = `${s.exerciseId}#${s.sessionId}`;
      const entry = bySession.get(key) ?? { sessionId: s.sessionId, sets: [] };
      entry.sets.push(s);
      bySession.set(key, entry);
    }

    const out: Record<string, LastPerformance> = {};
    for (const [key, entry] of Array.from(bySession.entries())) {
      const exerciseId = key.split('#')[0];
      const top = entry.sets.reduce((b, s) => (s.weightKg > b.weightKg ? s : b), entry.sets[0]);
      // Iteration follows the loggedAt ordering above, so the last write wins.
      out[exerciseId] = { weightKg: top.weightKg, reps: top.actualReps, sets: entry.sets.length };
    }
    return out;
  }

  /** The PREV column for one exercise: last session's sets, in order. */
  async previousSets(userId: number, exerciseId: string) {
    const rows = await this.setRepo
      .createQueryBuilder('s')
      .innerJoin('gym_sessions', 'g', 'g.id = s.sessionId')
      .where('g.userId = :userId', { userId })
      .andWhere('s.exerciseId = :exerciseId', { exerciseId })
      .andWhere('s.isWarmup = :warmup', { warmup: false })
      .orderBy('s.loggedAt', 'DESC')
      .getMany();
    if (!rows.length) return { exerciseId, sessionId: null, sets: [] as unknown[] };

    const sessionId = rows[0].sessionId;
    return {
      exerciseId,
      sessionId,
      sets: rows
        .filter((s) => s.sessionId === sessionId)
        .sort((a, b) => a.setNumber - b.setNumber)
        .map((s) => ({ setNumber: s.setNumber, weightKg: s.weightKg, reps: s.actualReps })),
    };
  }

  async resetSession(sessionId: number, userId: number) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');
    // Delete all sets for this session
    await this.setRepo.delete({ sessionId });
    // Delete the session itself
    await this.sessionRepo.delete(sessionId);
    return { message: 'Session abandoned' };
  }

  async getSession(sessionId: number, userId: number) {
    return this.sessionRepo.findOne({
      where: { id: sessionId, userId },
      relations: ['sets'],
    });
  }

  async getUserSessions(userId: number) {
    return this.sessionRepo.find({
      where: { userId },
      order: { startedAt: 'DESC' },
      relations: ['sets'],
    });
  }

  /**
   * Aggregated history of every completed session — one row per session, with
   * the numbers the progress page needs. Returns totals rather than raw sets so
   * the payload stays small enough to cache offline.
   */
  async getSessionHistory(userId: number) {
    const sessions = await this.sessionRepo.find({
      where: { userId, completedAt: Not(IsNull()) },
      order: { startedAt: 'ASC' },
      relations: ['sets'],
    });

    // Running best per exercise, so each session knows which lifts set a PR.
    const bestSoFar: Record<string, number> = {};
    const rows = sessions.map((s) => {
      const working = (s.sets || []).filter((x) => !x.isWarmup);
      const byEx: Record<string, WorkoutSet[]> = {};
      working.forEach((x) => { (byEx[x.exerciseName] ||= []).push(x); });

      const prs: string[] = [];
      const exercises = Object.entries(byEx).map(([name, sets]) => {
        const topWeight = Math.max(...sets.map((x) => x.weightKg));
        const prior = bestSoFar[name] || 0;
        if (prior > 0 && topWeight > prior) prs.push(name);
        bestSoFar[name] = Math.max(prior, topWeight);
        return {
          name,
          sets: sets.length,
          topWeight,
          volume: Math.round(sets.reduce((a, x) => a + x.weightKg * x.actualReps, 0)),
        };
      }).sort((a, b) => b.volume - a.volume);

      return {
        id: s.id,
        workoutType: s.workoutType,
        date: ymd(s.startedAt),
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        durationSec: s.completedAt
          ? Math.max(0, Math.round((new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 1000))
          : null,
        totalVolume: Math.round(working.reduce((a, x) => a + x.weightKg * x.actualReps, 0)),
        totalSets: working.length,
        warmupSets: (s.sets || []).length - working.length,
        totalReps: working.reduce((a, x) => a + x.actualReps, 0),
        exerciseCount: exercises.length,
        exercises,
        prs,
        notes: s.notes || null,
      };
    });

    return rows.reverse(); // newest first for the UI
  }

  /** Celebration summary for a just-completed session. */
  async getSessionSummary(sessionId: number, userId: number) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, userId }, relations: ['sets'] });
    if (!session) throw new NotFoundException('Session not found');

    const all = session.sets || [];
    const working = all.filter((s) => !s.isWarmup);
    const vol = (sets: WorkoutSet[]) => sets.reduce((a, s) => a + s.weightKg * s.actualReps, 0);
    const totalVolume = Math.round(vol(working));
    const totalSets = working.length;
    const warmupSets = all.length - working.length;
    const durationSec = session.completedAt
      ? Math.max(0, Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 1000))
      : null;

    const byEx: Record<string, WorkoutSet[]> = {};
    working.forEach((s) => { (byEx[s.exerciseName] ||= []).push(s); });
    const exercises = Object.entries(byEx).map(([name, sets]) => ({
      name,
      sets: sets.length,
      topWeight: Math.max(...sets.map((s) => s.weightKg)),
      e1rm: Math.round(Math.max(...sets.map((s) => s.weightKg * (1 + s.actualReps / 30)))),
      volume: Math.round(vol(sets)),
    }));

    // Best weight per exercise across all *prior* sessions → weight PRs hit today.
    const history = await this.sessionRepo.find({ where: { userId }, relations: ['sets'], order: { startedAt: 'ASC' } });
    const priorBest: Record<string, number> = {};
    for (const ses of history) {
      if (ses.id === sessionId || new Date(ses.startedAt) >= new Date(session.startedAt)) continue;
      (ses.sets || []).filter((s) => !s.isWarmup).forEach((s) => {
        priorBest[s.exerciseName] = Math.max(priorBest[s.exerciseName] || 0, s.weightKg);
      });
    }
    const prsHit = exercises
      .filter((e) => e.topWeight > (priorBest[e.name] || 0) && (priorBest[e.name] || 0) > 0)
      .map((e) => ({ name: e.name, weightKg: e.topWeight }));

    // Compare to previous completed session of the same type.
    const sameType = history.filter(
      (s) => s.workoutType === session.workoutType && s.completedAt && s.id !== sessionId && new Date(s.startedAt) < new Date(session.startedAt),
    );
    const last = sameType[sameType.length - 1];
    let vsLast: { date: Date; volumeDelta: number; setsDelta: number } | null = null;
    if (last) {
      const lw = (last.sets || []).filter((s) => !s.isWarmup);
      vsLast = { date: last.startedAt, volumeDelta: totalVolume - Math.round(vol(lw)), setsDelta: totalSets - lw.length };
    }

    return {
      id: session.id, workoutType: session.workoutType, startedAt: session.startedAt, completedAt: session.completedAt,
      durationSec, totalVolume, totalSets, warmupSets, exercises, prsHit, vsLast,
    };
  }

  /** Distinct exercises the user has logged, for the per-exercise progress picker. */
  async getExerciseList(userId: number) {
    const sessions = await this.sessionRepo.find({ where: { userId }, relations: ['sets'] });
    const map: Record<string, { name: string; sessions: Set<number>; lastDate: Date; bestWeight: number }> = {};
    for (const s of sessions) {
      (s.sets || []).filter((x) => !x.isWarmup).forEach((x) => {
        const m = (map[x.exerciseName] ||= { name: x.exerciseName, sessions: new Set(), lastDate: s.startedAt, bestWeight: 0 });
        m.sessions.add(s.id);
        m.bestWeight = Math.max(m.bestWeight, x.weightKg);
        if (new Date(s.startedAt) > new Date(m.lastDate)) m.lastDate = s.startedAt;
      });
    }
    return Object.values(map)
      .map((m) => ({ name: m.name, sessions: m.sessions.size, lastDate: m.lastDate, bestWeight: m.bestWeight }))
      .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
  }

  /** Per-session progression for one exercise (top weight, est. 1RM, volume, PR flags). */
  async getExerciseHistory(userId: number, name: string) {
    const target = (name || '').trim().toLowerCase();
    const sessions = await this.sessionRepo.find({ where: { userId }, relations: ['sets'], order: { startedAt: 'ASC' } });
    const points: any[] = [];
    for (const s of sessions) {
      const sets = (s.sets || []).filter((x) => !x.isWarmup && x.exerciseName.trim().toLowerCase() === target);
      if (!sets.length) continue;
      const top = Math.max(...sets.map((x) => x.weightKg));
      const best = sets.reduce((b, x) => (x.weightKg > b.weightKg ? x : b), sets[0]);
      points.push({
        date: ymd(s.startedAt),
        topWeight: top,
        e1rm: Math.round(Math.max(...sets.map((x) => x.weightKg * (1 + x.actualReps / 30)))),
        volume: Math.round(sets.reduce((a, x) => a + x.weightKg * x.actualReps, 0)),
        reps: best.actualReps,
        sets: sets.length,
      });
    }
    let runMax = 0;
    points.forEach((p) => { p.isPR = p.topWeight > runMax; if (p.isPR) runMax = p.topWeight; });
    return points;
  }

  /**
   * One exercise, every session, every set.
   *
   * The question this answers is the one a person actually asks mid-set — *what
   * did I do last time, and the time before?* — so it returns the sets
   * themselves rather than a summary of them. v1 had `getExerciseHistory`, but
   * it keyed on the free-text `exerciseName` and collapsed each session to a
   * single top-weight point, which cannot tell you that last week's 100 was a
   * single and this week's is a triple.
   *
   * Keyed on `exerciseId`, so it covers the v1 history P2 backfilled as well as
   * everything logged since.
   */
  async exerciseProgress(userId: number, exerciseId: string) {
    const rows = await this.setRepo
      .createQueryBuilder('s')
      .innerJoin('gym_sessions', 'g', 'g.id = s.sessionId')
      .addSelect('g.startedAt', 'g_startedAt')
      .where('g.userId = :userId', { userId })
      .andWhere('s.exerciseId = :exerciseId', { exerciseId })
      .orderBy('s.loggedAt', 'ASC')
      .getMany();

    const cat = this.catalog.find(exerciseId);
    if (!rows.length) {
      return { exerciseId, name: cat?.name ?? exerciseId, sessions: [], best: null, totals: null };
    }

    const bySession = new Map<number, WorkoutSet[]>();
    for (const r of rows) {
      const list = bySession.get(r.sessionId) ?? [];
      list.push(r);
      bySession.set(r.sessionId, list);
    }

    const sessionRows = await this.sessionRepo.find({
      where: { id: In(Array.from(bySession.keys())) },
    });
    const dateOf = new Map(sessionRows.map((s) => [s.id, s.completedAt ?? s.startedAt]));

    let runningBestE1rm = 0;
    const sessions = Array.from(bySession.entries())
      .map(([sessionId, sets]) => {
        const working = sets.filter((s) => !s.isWarmup);
        const scored = working.length ? working : sets;
        const best = scored.reduce(
          (b, s) => (e1rm(s.weightKg, s.actualReps) > e1rm(b.weightKg, b.actualReps) ? s : b),
          scored[0],
        );
        return {
          sessionId,
          date: dateOf.get(sessionId) ?? null,
          sets: sets
            .sort((a, b) => a.setNumber - b.setNumber)
            .map((s) => ({
              setNumber: s.setNumber,
              weightKg: s.weightKg,
              reps: s.actualReps,
              isWarmup: !!s.isWarmup,
              rpe: s.rpe ?? null,
            })),
          topWeightKg: Math.max(...scored.map((s) => s.weightKg)),
          e1rm: Math.round(e1rm(best.weightKg, best.actualReps) * 10) / 10,
          volumeKg: Math.round(scored.reduce((a, s) => a + s.weightKg * s.actualReps, 0)),
          totalReps: scored.reduce((a, s) => a + s.actualReps, 0),
          workingSets: working.length,
          isPR: false,
        };
      })
      .sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());

    // A PR is a session that beat every session before it, so it has to be
    // marked in chronological order — then the list is reversed for display.
    for (const s of sessions) {
      if (s.e1rm > runningBestE1rm) {
        s.isPR = true;
        runningBestE1rm = s.e1rm;
      }
    }

    const allWorking = rows.filter((r) => !r.isWarmup);
    const heaviest = allWorking.reduce(
      (b, s) => (s.weightKg > b.weightKg ? s : b),
      allWorking[0] ?? rows[0],
    );

    return {
      exerciseId,
      name: cat?.name ?? rows[0].exerciseName ?? exerciseId,
      sessions: sessions.reverse(), // newest first — that is what gets read
      best: {
        weightKg: heaviest.weightKg,
        reps: heaviest.actualReps,
        e1rm: Math.round(runningBestE1rm * 10) / 10,
      },
      totals: {
        sessions: sessions.length,
        sets: allWorking.length,
        reps: allWorking.reduce((a, s) => a + s.actualReps, 0),
        volumeKg: Math.round(allWorking.reduce((a, s) => a + s.weightKg * s.actualReps, 0)),
      },
    };
  }

  async getHeatmapData(userId: number, year?: number) {
    const y = year || new Date().getFullYear();
    const start = new Date(`${y}-01-01`);
    const end = new Date(`${y}-12-31`);
    const sessions = await this.sessionRepo.find({
      where: { userId, startedAt: Between(start, end) },
      select: ['startedAt', 'workoutType', 'completedAt'],
    });
    // Group by date
    const map: Record<string, { count: number; types: string[] }> = {};
    sessions.forEach((s) => {
      const d = ymd(s.startedAt);
      if (!map[d]) map[d] = { count: 0, types: [] };
      map[d].count++;
      if (s.workoutType) map[d].types.push(s.workoutType);
    });
    return map;
  }

  // ─── Sets ────────────────────────────────────────────────────────────────────

  async logSet(
    sessionId: number,
    userId: number,
    exerciseName: string,
    setNumber: number,
    actualReps: number,
    weightKg: number,
    targetReps?: number,
    isWarmup = false,
    exerciseId?: string,
    rpe?: number,
  ) {
    // Verify session belongs to user
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');

    // Resolve the catalog id here, not in the callers. Ranks and the recovery
    // model key off `exerciseId` and ignore rows without one, so a set logged
    // without it is invisible to both — it would silently not count. P2's
    // backfill fixed the historical rows; this stops new ones being written the
    // same way. Null stays legitimate for names with no catalog equivalent.
    //
    // A caller that knows the id (everything in v2 does — the picker and the
    // generator both work in catalog ids) passes it and skips the name lookup,
    // which is a fuzzy match and the weaker of the two paths.
    const resolved = exerciseId && this.catalog.find(exerciseId)
      ? exerciseId
      : this.catalog.resolveLegacyName(exerciseName);

    const set = this.setRepo.create({
      sessionId,
      exerciseName,
      exerciseId: resolved,
      setNumber,
      actualReps,
      weightKg,
      targetReps,
      isWarmup,
      rpe: typeof rpe === 'number' && rpe >= 1 && rpe <= 10 ? rpe : null,
    });
    const saved = await this.setRepo.save(set);

    // Warm-up sets are ramp-up only — they never count toward PRs.
    if (!isWarmup) await this.checkAndUpdatePR(userId, exerciseName, weightKg, actualReps);

    return saved;
  }

  async deleteSet(setId: number, userId: number) {
    const set = await this.setRepo.findOne({
      where: { id: setId },
      relations: ['session'],
    });
    if (!set || set.session.userId !== userId) throw new NotFoundException('Set not found');
    await this.setRepo.delete(setId);
    return { message: 'Set deleted' };
  }

  // ─── Personal Records ────────────────────────────────────────────────────────

  async getPRs(userId: number) {
    return this.prRepo.find({ where: { userId }, order: { date: 'DESC' } });
  }

  async createPR(
    userId: number,
    exerciseType: string,
    weightKg: number,
    reps: number,
    date?: string,
    season?: string,
  ) {
    const pr = this.prRepo.create({
      userId,
      exerciseType,
      weightKg,
      reps,
      date: date || new Date().toISOString().split('T')[0],
      season: season || String(new Date().getFullYear()),
      isCurrentSeason: true,
    });
    const saved = await this.prRepo.save(pr);

    // Mark onboarding PRs as done
    await this.usersService.updateOnboarding(userId, { hasPRs: true });

    return saved;
  }

  private async checkAndUpdatePR(userId: number, exerciseName: string, weightKg: number, reps: number) {
    const bigThree = ['bench', 'squat', 'deadlift'];
    const type = bigThree.find((t) => exerciseName.toLowerCase().includes(t));
    if (!type) return;

    // Calculate estimated 1RM using Epley formula
    const new1rm = weightKg * (1 + reps / 30);

    const existing = await this.prRepo.findOne({
      where: { userId, exerciseType: type, isCurrentSeason: true },
      order: { weightKg: 'DESC' },
    });

    const existing1rm = existing ? existing.weightKg * (1 + existing.reps / 30) : 0;
    if (new1rm > existing1rm) {
      await this.createPR(userId, type, weightKg, reps);
    }
  }

  // ─── Last-session values (ghost hints) ──────────────────────────────────────

  /**
   * What the user actually did for each exercise the last time they trained this
   * workout type. Shown verbatim as the ghost/placeholder in the logging fields.
   *
   * This is a lookup, not a prediction: nothing is incremented, scaled, or
   * derived from body weight. Per exercise we return the last session's working
   * sets in order, so set 2 ghosts set 2's weight rather than an average.
   */
  async getLastSessionValues(userId: number, workoutType: string) {
    const lastSession = await this.sessionRepo.findOne({
      where: { userId, workoutType, completedAt: Not(IsNull()) },
      order: { startedAt: 'DESC' },
      relations: ['sets'],
    });
    if (!lastSession) return null;

    const byExercise: Record<string, { sets: { setNumber: number; weightKg: number; reps: number }[] }> = {};
    (lastSession.sets || [])
      .filter((s) => !s.isWarmup)
      .sort((a, b) => a.setNumber - b.setNumber)
      .forEach((s) => {
        (byExercise[s.exerciseName] ||= { sets: [] }).sets.push({
          setNumber: s.setNumber,
          weightKg: s.weightKg,
          reps: s.actualReps,
        });
      });

    return { workoutType, exercises: byExercise, basedOn: lastSession.startedAt };
  }

  // ─── Week comparison (for progress rate leaderboard) ────────────────────────

  async getWeeklyTotals(userId: number, weeks = 8): Promise<number[]> {
    const results: number[] = [];
    const now = new Date();
    for (let i = 0; i < weeks; i++) {
      const end = new Date(now);
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);

      const sessions = await this.sessionRepo.find({
        where: { userId, startedAt: Between(start, end) },
        relations: ['sets'],
      });
      const total = sessions.flatMap((s) => s.sets).reduce((sum, s) => sum + s.weightKg * s.actualReps, 0);
      results.unshift(total);
    }
    return results;
  }

  async getBigThree1RMs(userId: number): Promise<{ bench: number; squat: number; deadlift: number }> {
    const result = { bench: 0, squat: 0, deadlift: 0 };
    for (const type of Object.keys(result) as Array<keyof typeof result>) {
      const pr = await this.prRepo.findOne({
        where: { userId, exerciseType: type, isCurrentSeason: true },
        order: { weightKg: 'DESC' },
      });
      if (pr) result[type] = pr.weightKg * (1 + pr.reps / 30); // Epley 1RM
    }
    return result;
  }

  /** Heaviest single set logged for a given exercise name (case-insensitive). */
  async getBestLift(userId: number, exerciseName: string): Promise<number> {
    const target = exerciseName.trim().toLowerCase();
    const sessions = await this.sessionRepo.find({ where: { userId }, relations: ['sets'] });
    let best = 0;
    for (const s of sessions) {
      for (const set of s.sets || []) {
        if (set.exerciseName?.trim().toLowerCase() === target) best = Math.max(best, set.weightKg);
      }
    }
    return best;
  }
}

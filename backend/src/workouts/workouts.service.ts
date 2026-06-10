import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { GymSession } from './gym-session.entity';
import { WorkoutSet } from './workout-set.entity';
import { PersonalRecord } from './personal-record.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class WorkoutsService {
  constructor(
    @InjectRepository(GymSession) private sessionRepo: Repository<GymSession>,
    @InjectRepository(WorkoutSet) private setRepo: Repository<WorkoutSet>,
    @InjectRepository(PersonalRecord) private prRepo: Repository<PersonalRecord>,
    private usersService: UsersService,
  ) {}

  // ─── Sessions ───────────────────────────────────────────────────────────────

  async startSession(userId: number, workoutType: string, workoutPlanId?: number) {
    const session = this.sessionRepo.create({ userId, workoutType, workoutPlanId });
    return this.sessionRepo.save(session);
  }

  async completeSession(sessionId: number, userId: number, notes?: string) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');
    session.completedAt = new Date();
    if (notes) session.notes = notes;
    return this.sessionRepo.save(session);
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
        date: s.startedAt.toISOString().split('T')[0],
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
      const d = s.startedAt.toISOString().split('T')[0];
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
    suggestedWeight?: number,
  ) {
    // Verify session belongs to user
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');

    const set = this.setRepo.create({
      sessionId, exerciseName, setNumber, actualReps, weightKg, targetReps, isWarmup,
      suggestedWeight: isWarmup ? null : suggestedWeight ?? null,
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

  // ─── Progressive Overload Algorithm ─────────────────────────────────────────

  async suggestNextSession(userId: number, workoutType: string) {
    const user = await this.usersService.findById(userId);

    // Get last 4 sessions of same type
    const sessions = await this.sessionRepo.find({
      where: { userId, workoutType },
      order: { startedAt: 'DESC' },
      take: 4,
      relations: ['sets'],
    });

    if (!sessions.length) return null;

    const lastSession = sessions[0];
    const suggestions: Record<string, { weightKg: number; reps: number; reason: string }> = {};

    // Group working sets by exercise in last session (warm-ups never inform estimation)
    const exerciseMap: Record<string, WorkoutSet[]> = {};
    lastSession.sets.filter((s) => !s.isWarmup).forEach((s) => {
      if (!exerciseMap[s.exerciseName]) exerciseMap[s.exerciseName] = [];
      exerciseMap[s.exerciseName].push(s);
    });

    for (const [exercise, sets] of Object.entries(exerciseMap)) {
      suggestions[exercise] = this.predictExerciseWeight(sets, exercise, user?.weightKg);
    }

    return { workoutType, suggestions, basedOn: lastSession.startedAt };
  }

  /**
   * Pure double-progression prediction for one exercise from a prior session's
   * working sets. Single source of truth used by both live suggestions and the
   * admin estimation-accuracy analysis. (Behaviour unchanged from before.)
   */
  predictExerciseWeight(sets: WorkoutSet[], exercise: string, bodyWeight?: number) {
    const totalTargetReps = sets.reduce((sum, s) => sum + (s.targetReps || s.actualReps), 0);
    const totalActualReps = sets.reduce((sum, s) => sum + s.actualReps, 0);
    const completionRate = totalTargetReps > 0 ? totalActualReps / totalTargetReps : 1;
    const avgWeight = sets.reduce((sum, s) => sum + s.weightKg, 0) / sets.length;
    const avgReps = Math.round(totalActualReps / sets.length);

    const relativeBonus = bodyWeight ? this.getRelativeStrengthBonus(exercise, avgWeight, bodyWeight) : 1;

    let weightKg = avgWeight;
    let reason = '';
    if (completionRate >= 1.0) {
      const increment = this.getIncrement(exercise) * relativeBonus;
      weightKg = Math.round((avgWeight + increment) * 4) / 4;
      reason = `Great job! All reps completed. Increase by ${increment}kg.`;
    } else if (completionRate >= 0.8) {
      weightKg = avgWeight;
      reason = 'Good effort. Stay at same weight — aim to hit all reps next time.';
    } else {
      weightKg = Math.round(avgWeight * 0.9 * 4) / 4;
      reason = 'Tough session. Reduced weight by 10% to ensure proper form.';
    }
    return { weightKg, reps: avgReps, reason };
  }

  private getIncrement(exercise: string): number {
    const compound = ['bench', 'squat', 'deadlift', 'row', 'press'];
    const isCompound = compound.some((c) => exercise.toLowerCase().includes(c));
    return isCompound ? 2.5 : 1.25;
  }

  private getRelativeStrengthBonus(exercise: string, currentWeight: number, bodyWeight: number): number {
    // Intermediate standards (BW multiples)
    const standards: Record<string, number> = { bench: 1.0, squat: 1.5, deadlift: 2.0 };
    const type = Object.keys(standards).find((t) => exercise.toLowerCase().includes(t));
    if (!type) return 1;

    const target = standards[type] * bodyWeight;
    const ratio = currentWeight / target;

    // If above standard → more aggressive (+5% bonus)
    // If below → conservative (no bonus)
    return ratio >= 1 ? 1.05 : 1.0;
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

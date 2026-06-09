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
  ) {
    // Verify session belongs to user
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');

    const set = this.setRepo.create({ sessionId, exerciseName, setNumber, actualReps, weightKg, targetReps });
    const saved = await this.setRepo.save(set);

    // Auto-update PR if applicable
    await this.checkAndUpdatePR(userId, exerciseName, weightKg, actualReps);

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

    // Group sets by exercise in last session
    const exerciseMap: Record<string, WorkoutSet[]> = {};
    lastSession.sets.forEach((s) => {
      if (!exerciseMap[s.exerciseName]) exerciseMap[s.exerciseName] = [];
      exerciseMap[s.exerciseName].push(s);
    });

    for (const [exercise, sets] of Object.entries(exerciseMap)) {
      const totalTargetReps = sets.reduce((sum, s) => sum + (s.targetReps || s.actualReps), 0);
      const totalActualReps = sets.reduce((sum, s) => sum + s.actualReps, 0);
      const completionRate = totalTargetReps > 0 ? totalActualReps / totalTargetReps : 1;
      const avgWeight = sets.reduce((sum, s) => sum + s.weightKg, 0) / sets.length;
      const avgReps = Math.round(totalActualReps / sets.length);

      // Determine user's relative strength vs baseline
      const relativeBonus = user?.weightKg ? this.getRelativeStrengthBonus(exercise, avgWeight, user.weightKg) : 1;

      let suggestedWeight = avgWeight;
      let reason = '';

      if (completionRate >= 1.0) {
        const increment = this.getIncrement(exercise) * relativeBonus;
        suggestedWeight = Math.round((avgWeight + increment) * 4) / 4; // round to nearest 0.25
        reason = `Great job! All reps completed. Increase by ${increment}kg.`;
      } else if (completionRate >= 0.8) {
        suggestedWeight = avgWeight;
        reason = `Good effort. Stay at same weight — aim to hit all reps next time.`;
      } else {
        const deload = avgWeight * 0.9;
        suggestedWeight = Math.round(deload * 4) / 4;
        reason = `Tough session. Reduced weight by 10% to ensure proper form.`;
      }

      suggestions[exercise] = { weightKg: suggestedWeight, reps: avgReps, reason };
    }

    return { workoutType, suggestions, basedOn: lastSession.startedAt };
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
}

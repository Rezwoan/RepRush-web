import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Goal, GoalType } from './goal.entity';
import { UsersService } from '../users/users.service';
import { WorkoutsService } from '../workouts/workouts.service';
import { BodyWeightService } from '../body-weight/body-weight.service';

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

@Injectable()
export class GoalsService {
  constructor(
    @InjectRepository(Goal) private repo: Repository<Goal>,
    private usersService: UsersService,
    private workoutsService: WorkoutsService,
    private bodyWeightService: BodyWeightService,
  ) {}

  private async currentValue(userId: number, goal: Pick<Goal, 'type' | 'exerciseName'>): Promise<number> {
    if (goal.type === 'bodyweight') {
      const latest = await this.bodyWeightService.getLatest(userId);
      if (latest) return latest.weightKg;
      const user = await this.usersService.findById(userId);
      return user?.weightKg || 0;
    }
    return goal.exerciseName ? this.workoutsService.getBestLift(userId, goal.exerciseName) : 0;
  }

  private computeProgress(goal: Goal, current: number) {
    let percent = 0;
    let achieved = false;
    if (goal.type === 'lift') {
      percent = goal.targetValue > 0 ? clamp((current / goal.targetValue) * 100) : 0;
      achieved = current >= goal.targetValue && current > 0;
    } else {
      const start = goal.startValue ?? current;
      const span = start - goal.targetValue;
      if (span === 0) {
        percent = 100;
      } else {
        percent = clamp(((start - current) / span) * 100);
      }
      // achieved if we've reached/passed the target in the goal's direction
      achieved = span > 0 ? current <= goal.targetValue : current >= goal.targetValue;
    }
    return { percent, achieved };
  }

  async list(userId: number) {
    const goals = await this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    const out = [];
    for (const g of goals) {
      const current = await this.currentValue(userId, g);
      const { percent, achieved } = this.computeProgress(g, current);
      if (achieved && !g.achievedAt) {
        g.achievedAt = new Date();
        await this.repo.save(g);
      }
      out.push({
        id: g.id,
        type: g.type,
        exerciseName: g.exerciseName,
        targetValue: g.targetValue,
        startValue: g.startValue,
        current: Math.round(current * 10) / 10,
        percent,
        achieved,
        achievedAt: g.achievedAt,
        createdAt: g.createdAt,
      });
    }
    return out;
  }

  async create(userId: number, data: { type: GoalType; exerciseName?: string; targetValue: number }) {
    if (!data.type || !data.targetValue || data.targetValue <= 0) {
      throw new BadRequestException('A goal type and a positive target are required');
    }
    if (data.type === 'lift' && !data.exerciseName) {
      throw new BadRequestException('Pick an exercise for a lift goal');
    }
    const startValue = await this.currentValue(userId, { type: data.type, exerciseName: data.exerciseName });
    const goal = this.repo.create({
      userId,
      type: data.type,
      exerciseName: data.type === 'lift' ? data.exerciseName : null,
      targetValue: data.targetValue,
      startValue,
    });
    return this.repo.save(goal);
  }

  async remove(userId: number, id: number) {
    await this.repo.delete({ id, userId });
    return { message: 'Goal removed' };
  }
}

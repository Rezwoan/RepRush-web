import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { WorkoutsService } from '../workouts/workouts.service';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  target: number;
  current: number;
  percent: number;
  unlocked: boolean;
  category: 'strength' | 'consistency' | 'total';
}

@Injectable()
export class AchievementsService {
  constructor(
    private usersService: UsersService,
    private workoutsService: WorkoutsService,
  ) {}

  async getUserAchievements(userId: number): Promise<Achievement[]> {
    const user = await this.usersService.findById(userId);
    const lifts = await this.workoutsService.getBigThree1RMs(userId);
    const bw = user.weightKg || 75; // fallback bodyweight

    const goals = [
      {
        id: 'bench_1x_bw',
        title: 'Bench Press: 1× Bodyweight',
        description: 'Bench press your own bodyweight',
        category: 'strength' as const,
        target: bw * 1,
        current: lifts.bench,
      },
      {
        id: 'squat_1_5x_bw',
        title: 'Squat: 1.5× Bodyweight',
        description: 'Squat 1.5 times your bodyweight',
        category: 'strength' as const,
        target: bw * 1.5,
        current: lifts.squat,
      },
      {
        id: 'deadlift_2x_bw',
        title: 'Deadlift: 2× Bodyweight',
        description: 'Deadlift twice your bodyweight',
        category: 'strength' as const,
        target: bw * 2,
        current: lifts.deadlift,
      },
      {
        id: 'total_4_5x_bw',
        title: 'Total: 4.5× Bodyweight',
        description: 'Combined bench + squat + deadlift 4.5× your bodyweight',
        category: 'total' as const,
        target: bw * 4.5,
        current: lifts.bench + lifts.squat + lifts.deadlift,
      },
      {
        id: 'bench_1_25x_bw',
        title: 'Bench Press: 1.25× Bodyweight',
        description: 'Intermediate bench milestone',
        category: 'strength' as const,
        target: bw * 1.25,
        current: lifts.bench,
      },
      {
        id: 'squat_2x_bw',
        title: 'Squat: 2× Bodyweight',
        description: 'Advanced squat milestone',
        category: 'strength' as const,
        target: bw * 2,
        current: lifts.squat,
      },
      {
        id: 'deadlift_2_5x_bw',
        title: 'Deadlift: 2.5× Bodyweight',
        description: 'Advanced deadlift milestone',
        category: 'strength' as const,
        target: bw * 2.5,
        current: lifts.deadlift,
      },
    ];

    return goals.map((g) => ({
      ...g,
      percent: Math.min(100, Math.round((g.current / g.target) * 100)),
      unlocked: g.current >= g.target,
    }));
  }
}

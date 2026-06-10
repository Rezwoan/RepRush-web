import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { WorkoutsService } from '../workouts/workouts.service';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unit: string;
  target: number;
  current: number;
  percent: number;
  unlocked: boolean;
  category: 'strength' | 'consistency' | 'total' | 'volume';
}

@Injectable()
export class AchievementsService {
  constructor(
    private usersService: UsersService,
    private workoutsService: WorkoutsService,
  ) {}

  private currentStreak(dates: Set<string>): number {
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 400; i++) {
      const key = d.toISOString().split('T')[0];
      if (dates.has(key)) streak++;
      else if (i > 0) break; // today may be a rest day; only break after day 0
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  async getUserAchievements(userId: number): Promise<Achievement[]> {
    const user = await this.usersService.findById(userId);
    const lifts = await this.workoutsService.getBigThree1RMs(userId);
    const bw = user.weightKg || 75;

    const sessions = await this.workoutsService.getUserSessions(userId);
    const completed = sessions.filter((s) => s.completedAt);
    const totalSessions = completed.length;
    const totalVolume = completed
      .flatMap((s) => s.sets || [])
      .reduce((sum: number, set: any) => sum + (set.weightKg || 0) * (set.actualReps || 0), 0);
    const dayset = new Set(completed.map((s) => new Date(s.startedAt).toISOString().split('T')[0]));
    const streak = this.currentStreak(dayset);

    const goals: Omit<Achievement, 'percent' | 'unlocked'>[] = [
      // ── Consistency ──
      { id: 'first_session', title: 'First Rep', description: 'Complete your first workout', unit: 'sessions', category: 'consistency', target: 1, current: totalSessions },
      { id: 'sessions_10', title: 'Getting Consistent', description: 'Complete 10 workouts', unit: 'sessions', category: 'consistency', target: 10, current: totalSessions },
      { id: 'sessions_25', title: 'Regular', description: 'Complete 25 workouts', unit: 'sessions', category: 'consistency', target: 25, current: totalSessions },
      { id: 'sessions_50', title: 'Committed', description: 'Complete 50 workouts', unit: 'sessions', category: 'consistency', target: 50, current: totalSessions },
      { id: 'sessions_100', title: 'Centurion', description: 'Complete 100 workouts', unit: 'sessions', category: 'consistency', target: 100, current: totalSessions },
      { id: 'streak_3', title: 'On a Roll', description: '3-day training streak', unit: 'days', category: 'consistency', target: 3, current: streak },
      { id: 'streak_7', title: 'Week Warrior', description: '7-day training streak', unit: 'days', category: 'consistency', target: 7, current: streak },
      { id: 'streak_14', title: 'Locked In', description: '14-day training streak', unit: 'days', category: 'consistency', target: 14, current: streak },

      // ── Volume ──
      { id: 'volume_10k', title: 'Ton of Work', description: 'Lift 10,000 kg total volume', unit: 'kg', category: 'volume', target: 10000, current: totalVolume },
      { id: 'volume_100k', title: 'Heavy Hitter', description: 'Lift 100,000 kg total volume', unit: 'kg', category: 'volume', target: 100000, current: totalVolume },
      { id: 'volume_500k', title: 'Iron Mountain', description: 'Lift 500,000 kg total volume', unit: 'kg', category: 'volume', target: 500000, current: totalVolume },

      // ── Strength (bodyweight-relative) ──
      { id: 'bench_bw', title: 'Bench: Bodyweight', description: 'Bench press your own bodyweight', unit: 'kg', category: 'strength', target: bw, current: lifts.bench },
      { id: 'bench_1_5x', title: 'Bench: 1.5× BW', description: 'An advanced bench milestone', unit: 'kg', category: 'strength', target: bw * 1.5, current: lifts.bench },
      { id: 'squat_1_5x', title: 'Squat: 1.5× BW', description: 'Squat 1.5× your bodyweight', unit: 'kg', category: 'strength', target: bw * 1.5, current: lifts.squat },
      { id: 'squat_2x', title: 'Squat: 2× BW', description: 'An advanced squat milestone', unit: 'kg', category: 'strength', target: bw * 2, current: lifts.squat },
      { id: 'deadlift_2x', title: 'Deadlift: 2× BW', description: 'Deadlift twice your bodyweight', unit: 'kg', category: 'strength', target: bw * 2, current: lifts.deadlift },
      { id: 'deadlift_2_5x', title: 'Deadlift: 2.5× BW', description: 'An elite deadlift milestone', unit: 'kg', category: 'strength', target: bw * 2.5, current: lifts.deadlift },
      { id: 'total_4_5x', title: '1000lb-ish Club', description: 'Combined big-three 4.5× bodyweight', unit: 'kg', category: 'total', target: bw * 4.5, current: lifts.bench + lifts.squat + lifts.deadlift },
    ];

    return goals.map((g) => ({
      ...g,
      current: Math.round(g.current),
      target: Math.round(g.target),
      percent: Math.min(100, Math.round((g.current / g.target) * 100)),
      unlocked: g.current >= g.target,
    }));
  }
}

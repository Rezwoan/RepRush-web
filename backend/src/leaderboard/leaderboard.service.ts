import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { WorkoutsService } from '../workouts/workouts.service';

// Wilks coefficients (male)
const WILKS_MALE = { a: -216.0475144, b: 16.2606339, c: -0.002388645, d: -0.00113732, e: 7.01863e-6, f: -1.291e-8 };
// Wilks coefficients (female)
const WILKS_FEMALE = { a: 594.31747775582, b: -27.23842536447, c: 0.82112226871, d: -0.00930733913, e: 4.731582e-5, f: -9.054e-8 };

function wilksCoefficient(bw: number, isFemale = false) {
  const c = isFemale ? WILKS_FEMALE : WILKS_MALE;
  const denom = c.a + c.b * bw + c.c * bw ** 2 + c.d * bw ** 3 + c.e * bw ** 4 + c.f * bw ** 5;
  return 500 / denom;
}

@Injectable()
export class LeaderboardService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private workoutsService: WorkoutsService,
  ) {}

  async getRelativeStrengthLeaderboard() {
    const users = await this.userRepo.find({ where: { role: UserRole.USER, isActivated: true } });
    const entries = await Promise.all(
      users.map(async (user) => {
        const lifts = await this.workoutsService.getBigThree1RMs(user.id);
        const total = lifts.bench + lifts.squat + lifts.deadlift;
        const score = user.weightKg ? total / user.weightKg : 0;
        return {
          userId: user.id, name: user.name, profileImage: user.profileImage,
          weightKg: user.weightKg, bench: lifts.bench, squat: lifts.squat,
          deadlift: lifts.deadlift, total, score: Math.round(score * 100) / 100,
        };
      }),
    );
    return entries.filter((e) => e.total > 0).sort((a, b) => b.score - a.score)
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }

  async getWilksLeaderboard() {
    const users = await this.userRepo.find({ where: { role: UserRole.USER, isActivated: true } });
    const entries = await Promise.all(
      users.map(async (user) => {
        if (!user.weightKg) return null;
        const lifts = await this.workoutsService.getBigThree1RMs(user.id);
        const total = lifts.bench + lifts.squat + lifts.deadlift;
        if (!total) return null;
        const coefficient = wilksCoefficient(user.weightKg);
        const score = total * coefficient;
        return {
          userId: user.id, name: user.name, profileImage: user.profileImage,
          weightKg: user.weightKg, bench: lifts.bench, squat: lifts.squat,
          deadlift: lifts.deadlift, total, score: Math.round(score * 10) / 10,
        };
      }),
    );
    return entries.filter(Boolean).sort((a, b) => b.score - a.score)
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }

  async getProgressRateLeaderboard() {
    const users = await this.userRepo.find({ where: { role: UserRole.USER, isActivated: true } });
    const entries = await Promise.all(
      users.map(async (user) => {
        const weeklyTotals = await this.workoutsService.getWeeklyTotals(user.id, 8);
        const improvements: number[] = [];
        for (let i = 1; i < weeklyTotals.length; i++) {
          if (weeklyTotals[i - 1] > 0) {
            improvements.push(((weeklyTotals[i] - weeklyTotals[i - 1]) / weeklyTotals[i - 1]) * 100);
          }
        }
        const score = improvements.length
          ? improvements.reduce((s, v) => s + v, 0) / improvements.length
          : 0;
        return {
          userId: user.id, name: user.name, profileImage: user.profileImage,
          score: Math.round(score * 100) / 100, weeklyTotals,
        };
      }),
    );
    return entries.sort((a, b) => b.score - a.score).map((e, i) => ({ ...e, rank: i + 1 }));
  }
}

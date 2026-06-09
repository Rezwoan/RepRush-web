import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { WorkoutsService } from '../workouts/workouts.service';
import { MailService } from '../mail/mail.service';

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private usersService: UsersService,
    private workoutsService: WorkoutsService,
    private mailService: MailService,
  ) {}

  async getAllUsers() {
    const users = await this.userRepo.find({ where: { role: UserRole.USER } });
    const enriched = await Promise.all(
      users.map(async (u) => {
        const { passwordHash, inviteToken, ...safe } = u;
        const lifts = await this.workoutsService.getBigThree1RMs(u.id);
        const onboarding = await this.usersService.getOnboarding(u.id);
        const percent = await this.usersService.computeOnboardingPercent(u.id);
        return { ...safe, lifts, onboarding, onboardingPercent: percent };
      }),
    );
    return enriched;
  }

  async inviteUser(email: string, name: string) {
    const tempPassword = generatePassword();
    const { user, inviteToken } = await this.usersService.createOrRefreshInvite(email, name, tempPassword);
    await this.mailService.sendInvitation(email, name, inviteToken, tempPassword);
    return { message: `Invitation sent to ${email}`, userId: user.id };
  }

  async resetUserPassword(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new Error('User not found');
    const newPassword = generatePassword();
    await this.usersService.adminResetPassword(userId, newPassword);
    await this.mailService.sendPasswordReset(user.email, newPassword);
    return { message: 'Password reset and emailed to user' };
  }

  async deleteUser(userId: number) {
    await this.usersService.deleteUser(userId);
    return { message: 'User deleted' };
  }

  async getUserDetail(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new Error('User not found');
    const { passwordHash, inviteToken, ...safe } = user;
    const lifts = await this.workoutsService.getBigThree1RMs(userId);
    const sessions = await this.workoutsService.getUserSessions(userId);
    const prs = await this.workoutsService.getPRs(userId);
    const onboarding = await this.usersService.getOnboarding(userId);
    return { ...safe, lifts, sessions, prs, onboarding };
  }

  async getComparisonData(userIds: number[]) {
    const data = await Promise.all(
      userIds.map(async (id) => {
        const user = await this.usersService.findById(id);
        if (!user) return null;
        const lifts = await this.workoutsService.getBigThree1RMs(id);
        const weeklyTotals = await this.workoutsService.getWeeklyTotals(id, 8);
        return { userId: id, name: user.name, lifts, weeklyTotals };
      }),
    );
    return data.filter(Boolean);
  }

  async getAdminStats() {
    const totalUsers = await this.userRepo.count({ where: { role: UserRole.USER } });
    const activeUsers = await this.userRepo.count({ where: { role: UserRole.USER, isActivated: true } });
    return { totalUsers, activeUsers, pendingActivation: totalUsers - activeUsers };
  }

  async getUserReport(userId: number, period: 'weekly' | 'monthly') {
    const user = await this.usersService.findById(userId);
    if (!user) throw new Error('User not found');

    const days = period === 'weekly' ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const sessions = await this.workoutsService.getUserSessions(userId);
    const filtered = sessions.filter((s) => new Date(s.startedAt) >= cutoff && s.completedAt);

    const totalVolume = filtered.flatMap((s) => s.sets || [])
      .reduce((sum: number, s: any) => sum + (s.weightKg || 0) * (s.actualReps || 0), 0);

    const totalSets = filtered.flatMap((s) => s.sets || []).length;

    const workoutTypeCounts: Record<string, number> = {};
    filtered.forEach((s) => {
      if (s.workoutType) workoutTypeCounts[s.workoutType] = (workoutTypeCounts[s.workoutType] || 0) + 1;
    });
    const topWorkout = Object.entries(workoutTypeCounts).sort((a, b) => b[1] - a[1])[0];

    const lifts = await this.workoutsService.getBigThree1RMs(userId);

    return {
      user: { id: user.id, name: user.name, email: user.email },
      period,
      days,
      sessions: filtered.length,
      totalVolume: Math.round(totalVolume),
      totalSets,
      topWorkout: topWorkout ? topWorkout[0] : null,
      lifts,
      sessionList: filtered.map((s) => ({
        id: s.id,
        workoutType: s.workoutType,
        startedAt: s.startedAt,
        sets: (s.sets || []).length,
        volume: (s.sets || []).reduce((sum: number, set: any) => sum + set.weightKg * set.actualReps, 0),
      })),
    };
  }

  async sendUserReport(userId: number, period: 'weekly' | 'monthly') {
    const report = await this.getUserReport(userId, period);
    const { user } = report;

    const reportHtml = `
      <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin-bottom:16px;">
        <h3 style="color:#f97316;margin-top:0;">${period === 'weekly' ? 'Weekly' : 'Monthly'} Summary</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#9ca3af;">Sessions completed</td><td style="color:#ffffff;font-weight:bold;text-align:right;">${report.sessions}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Total sets</td><td style="color:#ffffff;font-weight:bold;text-align:right;">${report.totalSets}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Total volume lifted</td><td style="color:#ffffff;font-weight:bold;text-align:right;">${report.totalVolume.toLocaleString()} kg</td></tr>
          ${report.topWorkout ? `<tr><td style="padding:8px 0;color:#9ca3af;">Favourite workout</td><td style="color:#ffffff;font-weight:bold;text-align:right;">${report.topWorkout}</td></tr>` : ''}
        </table>
      </div>
      <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin-bottom:16px;">
        <h3 style="color:#f97316;margin-top:0;">Big Three Estimated 1RMs</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#9ca3af;">Bench Press</td><td style="color:#ffffff;font-weight:bold;text-align:right;">${report.lifts.bench > 0 ? Math.round(report.lifts.bench) + ' kg' : '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Squat</td><td style="color:#ffffff;font-weight:bold;text-align:right;">${report.lifts.squat > 0 ? Math.round(report.lifts.squat) + ' kg' : '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#9ca3af;">Deadlift</td><td style="color:#ffffff;font-weight:bold;text-align:right;">${report.lifts.deadlift > 0 ? Math.round(report.lifts.deadlift) + ' kg' : '—'}</td></tr>
        </table>
      </div>
    `;

    await this.mailService.sendWorkoutReport(user.email, user.name, period, reportHtml);
    return { message: `${period} report sent to ${user.email}` };
  }
}

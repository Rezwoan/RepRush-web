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

    const row = (label: string, value: string, accent = false) =>
      `<tr>
        <td style="padding:9px 0;color:#8a97a8;font-size:14px;border-bottom:1px solid #1c2430;">${label}</td>
        <td style="padding:9px 0;color:${accent ? '#faba0c' : '#ffffff'};font-weight:700;text-align:right;font-size:14px;border-bottom:1px solid #1c2430;">${value}</td>
      </tr>`;
    const card = (title: string, rows: string) =>
      `<div style="background:#0b0f17;border:1px solid #232c3a;border-radius:12px;padding:20px 22px;margin-bottom:16px;">
        <h3 style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#3b97f5;">${title}</h3>
        <table role="presentation" style="width:100%;border-collapse:collapse;">${rows}</table>
      </div>`;
    const kg = (n: number) => (n > 0 ? Math.round(n) + ' kg' : '—');

    const reportHtml = `
      ${card(`${period === 'weekly' ? 'Weekly' : 'Monthly'} Summary`,
        row('Sessions completed', String(report.sessions), true) +
        row('Total sets', String(report.totalSets)) +
        row('Total volume lifted', `${report.totalVolume.toLocaleString()} kg`) +
        (report.topWorkout ? row('Favourite workout', report.topWorkout) : ''),
      )}
      ${card('Big Three — Estimated 1RMs',
        row('Bench Press', kg(report.lifts.bench)) +
        row('Squat', kg(report.lifts.squat)) +
        row('Deadlift', kg(report.lifts.deadlift)),
      )}
    `;

    await this.mailService.sendWorkoutReport(user.email, user.name, period, reportHtml);
    return { message: `${period} report sent to ${user.email}` };
  }
}

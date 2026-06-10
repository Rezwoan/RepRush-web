import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { WorkoutsService } from '../workouts/workouts.service';
import { ExercisesService } from '../exercises/exercises.service';
import { BodyWeightService } from '../body-weight/body-weight.service';
import { MailService } from '../mail/mail.service';

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const volumeOf = (sets: any[] = []) =>
  sets.reduce((sum: number, s: any) => sum + (s.weightKg || 0) * (s.actualReps || 0), 0);

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private usersService: UsersService,
    private workoutsService: WorkoutsService,
    private exercisesService: ExercisesService,
    private bodyWeightService: BodyWeightService,
    private mailService: MailService,
  ) {}

  private members() {
    return this.userRepo.find({ where: { role: UserRole.USER }, order: { createdAt: 'DESC' } });
  }

  async getAllUsers() {
    const users = await this.members();
    return Promise.all(
      users.map(async (u) => {
        const { passwordHash, inviteToken, ...safe } = u;
        const lifts = await this.workoutsService.getBigThree1RMs(u.id);
        const onboarding = await this.usersService.getOnboarding(u.id);
        const percent = await this.usersService.computeOnboardingPercent(u.id);
        const sessions = await this.workoutsService.getUserSessions(u.id); // sorted DESC
        const completed = sessions.filter((s) => s.completedAt);
        const totalVolume = completed.reduce((sum, s) => sum + volumeOf(s.sets), 0);
        return {
          ...safe,
          lifts,
          onboarding,
          onboardingPercent: percent,
          sessionCount: completed.length,
          totalVolume: Math.round(totalVolume),
          lastActive: sessions.length ? sessions[0].startedAt : null,
        };
      }),
    );
  }

  async inviteUser(email: string, name: string) {
    const tempPassword = generatePassword();
    const { user, inviteToken } = await this.usersService.createOrRefreshInvite(email, name, tempPassword);
    await this.mailService.sendInvitation(email, name, inviteToken, tempPassword);
    return { message: `Invitation sent to ${email}`, userId: user.id };
  }

  async resendInvite(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.isActivated) {
      throw new ConflictException('User has already activated their account — use Reset Password instead.');
    }
    const tempPassword = generatePassword();
    const { inviteToken } = await this.usersService.createOrRefreshInvite(user.email, user.name, tempPassword);
    await this.mailService.sendInvitation(user.email, user.name, inviteToken, tempPassword);
    return { message: `Invitation resent to ${user.email}` };
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
    const weeklyTotals = await this.workoutsService.getWeeklyTotals(userId, 8);
    const bodyWeight = await this.bodyWeightService.getForAdmin(userId, 120);
    const userPlans = await this.exercisesService.getUserPlans(userId);
    const assignedPlans = userPlans.map((up: any) => ({ id: up.plan.id, name: up.plan.name }));
    const completed = sessions.filter((s) => s.completedAt);
    const totalVolume = Math.round(completed.reduce((sum, s) => sum + volumeOf(s.sets), 0));
    return {
      ...safe,
      lifts,
      sessions: sessions.slice(0, 20).map((s) => ({
        id: s.id, workoutType: s.workoutType, startedAt: s.startedAt, completedAt: s.completedAt,
        sets: (s.sets || []).length, volume: Math.round(volumeOf(s.sets)),
      })),
      prs,
      onboarding,
      weeklyTotals,
      bodyWeight,
      assignedPlans,
      sessionCount: completed.length,
      totalVolume,
    };
  }

  async getComparisonData(userIds: number[]) {
    const data = await Promise.all(
      userIds.map(async (id) => {
        const user = await this.usersService.findById(id);
        if (!user) return null;
        const lifts = await this.workoutsService.getBigThree1RMs(id);
        const weeklyTotals = await this.workoutsService.getWeeklyTotals(id, 8);
        return { userId: id, name: user.name || user.email, lifts, weeklyTotals };
      }),
    );
    return data.filter(Boolean);
  }

  async getAdminStats() {
    const users = await this.members();
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.isActivated).length;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    let totalSessions = 0, sessionsThisWeek = 0, volumeThisWeek = 0, volumeAllTime = 0;
    let onboardingSum = 0;
    const activeThisWeek = new Set<number>();

    for (const u of users) {
      onboardingSum += await this.usersService.computeOnboardingPercent(u.id);
      const sessions = await this.workoutsService.getUserSessions(u.id);
      const completed = sessions.filter((s) => s.completedAt);
      totalSessions += completed.length;
      for (const s of completed) {
        const vol = volumeOf(s.sets);
        volumeAllTime += vol;
        if (new Date(s.startedAt) >= weekAgo) {
          sessionsThisWeek++;
          volumeThisWeek += vol;
          activeThisWeek.add(u.id);
        }
      }
    }

    const totalPlans = (await this.exercisesService.getAllPlans()).length;

    return {
      totalUsers,
      activeUsers,
      pendingActivation: totalUsers - activeUsers,
      totalPlans,
      totalSessions,
      sessionsThisWeek,
      volumeThisWeek: Math.round(volumeThisWeek),
      volumeAllTime: Math.round(volumeAllTime),
      activeThisWeek: activeThisWeek.size,
      avgOnboarding: totalUsers ? Math.round(onboardingSum / totalUsers) : 0,
    };
  }

  /** Org-wide activity feed + per-day chart + most-active leaderboard. */
  async getActivity() {
    const users = await this.members();
    const all: { userId: number; name: string; workoutType: string; startedAt: Date; volume: number; sets: number }[] = [];

    for (const u of users) {
      const sessions = await this.workoutsService.getUserSessions(u.id);
      for (const s of sessions.filter((x) => x.completedAt)) {
        all.push({
          userId: u.id,
          name: u.name || u.email,
          workoutType: s.workoutType,
          startedAt: s.startedAt,
          volume: Math.round(volumeOf(s.sets)),
          sets: (s.sets || []).length,
        });
      }
    }
    all.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    // Per-day session counts for the last 30 days
    const perDay: { date: string; sessions: number }[] = [];
    const counts: Record<string, number> = {};
    all.forEach((s) => {
      const d = new Date(s.startedAt).toISOString().split('T')[0];
      counts[d] = (counts[d] || 0) + 1;
    });
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      perDay.push({ date: key, sessions: counts[key] || 0 });
    }

    // Most active members over the last 30 days
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const agg: Record<number, { name: string; sessions: number; volume: number }> = {};
    all.filter((s) => new Date(s.startedAt) >= monthAgo).forEach((s) => {
      const a = (agg[s.userId] ||= { name: s.name, sessions: 0, volume: 0 });
      a.sessions++;
      a.volume += s.volume;
    });
    const topMembers = Object.values(agg).sort((a, b) => b.sessions - a.sessions).slice(0, 6);

    return {
      recent: all.slice(0, 15),
      perDay,
      topMembers,
    };
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

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as webpush from 'web-push';
import { PushSubscription } from './push-subscription.entity';
import { User, UserRole } from '../users/user.entity';
import { CreatineService } from '../creatine/creatine.service';
import { WorkoutsService } from '../workouts/workouts.service';

// Cron decorators are evaluated at import time, so the timezone must come from
// the process env (systemd sets it before launch), not ConfigService.
const TZ = process.env.REMINDER_TZ || 'Asia/Dhaka';

interface Payload { title: string; body: string; url?: string; tag?: string }

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    @InjectRepository(PushSubscription) private subRepo: Repository<PushSubscription>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private config: ConfigService,
    private creatineService: CreatineService,
    private workoutsService: WorkoutsService,
  ) {}

  onModuleInit() {
    const pub = this.config.get<string>('VAPID_PUBLIC_KEY');
    const priv = this.config.get<string>('VAPID_PRIVATE_KEY');
    if (pub && priv) {
      webpush.setVapidDetails(this.config.get('VAPID_SUBJECT') || 'mailto:admin@reprush.app', pub, priv);
      this.enabled = true;
      this.logger.log('Web push enabled.');
    } else {
      this.logger.warn('VAPID keys not configured — push notifications disabled.');
    }
  }

  getPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') || null;
  }

  async subscribe(userId: number, sub: any) {
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) return { ok: false };
    const existing = await this.subRepo.findOne({ where: { endpoint } });
    if (existing) {
      Object.assign(existing, { userId, p256dh, auth });
      await this.subRepo.save(existing);
    } else {
      await this.subRepo.save(this.subRepo.create({ userId, endpoint, p256dh, auth }));
    }
    return { ok: true };
  }

  async unsubscribe(endpoint: string) {
    if (endpoint) await this.subRepo.delete({ endpoint });
    return { ok: true };
  }

  async hasSubscription(userId: number) {
    return (await this.subRepo.count({ where: { userId } })) > 0;
  }

  private async sendToUser(userId: number, payload: Payload) {
    if (!this.enabled) return;
    const subs = await this.subRepo.find({ where: { userId } });
    const body = JSON.stringify(payload);
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await this.subRepo.delete({ id: s.id });
        else this.logger.warn(`push send failed: ${e?.message}`);
      }
    }
  }

  /** Manual confirmation ping when a user turns notifications on. */
  async sendTest(userId: number) {
    await this.sendToUser(userId, { title: 'RepRush', body: 'Notifications are on — see you in the gym! 💪', url: '/dashboard', tag: 'test' });
    return { ok: this.enabled };
  }

  private dayBounds() {
    const d = new Date();
    return { start: new Date(d.getFullYear(), d.getMonth(), d.getDate()), end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) };
  }

  private members() {
    return this.userRepo.find({ where: { role: UserRole.USER, isActivated: true } });
  }

  // Nudge to train — 5pm local. Only for recently-active members who haven't trained today.
  @Cron('0 17 * * *', { name: 'workout-reminder', timeZone: TZ })
  async workoutReminder() {
    if (!this.enabled) return;
    const { start, end } = this.dayBounds();
    const threeAgo = new Date();
    threeAgo.setDate(threeAgo.getDate() - 3);
    for (const u of await this.members()) {
      if ((u as any).remindWorkouts === false) continue;
      if (!(await this.hasSubscription(u.id))) continue;
      const sessions = await this.workoutsService.getUserSessions(u.id);
      if (sessions.some((s) => new Date(s.startedAt) >= start && new Date(s.startedAt) < end)) continue;
      if (!sessions.some((s) => new Date(s.startedAt) >= threeAgo)) continue; // don't nag dormant users
      await this.sendToUser(u.id, { title: 'Time to train 💪', body: "You haven't logged a workout today. Keep your streak alive!", url: '/workout', tag: 'workout' });
    }
  }

  // Creatine reminder — 8pm local, only if none logged today.
  @Cron('0 20 * * *', { name: 'creatine-reminder', timeZone: TZ })
  async creatineReminder() {
    if (!this.enabled) return;
    for (const u of await this.members()) {
      if ((u as any).remindSupplements === false) continue;
      if (!(await this.hasSubscription(u.id))) continue;
      const { totalGrams } = await this.creatineService.getTodayLogs(u.id);
      if (totalGrams > 0) continue;
      await this.sendToUser(u.id, { title: 'Creatine reminder 💊', body: "You haven't logged your creatine today.", url: '/dashboard', tag: 'creatine' });
    }
  }
}

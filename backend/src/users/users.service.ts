import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole } from './user.entity';
import { OnboardingProgress } from './onboarding.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(OnboardingProgress) private onboardingRepo: Repository<OnboardingProgress>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepo.find({ where: { role: UserRole.USER } });
  }

  async findById(id: number): Promise<User> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User> {
    return this.userRepo.findOne({ where: { email } });
  }

  async findByUsername(username: string): Promise<User> {
    return this.userRepo.findOne({ where: { username } });
  }

  async findByInviteToken(token: string): Promise<User> {
    return this.userRepo.findOne({ where: { inviteToken: token } });
  }

  async createUser(email: string, name: string, tempPassword: string, role = UserRole.USER, forceActivate = false) {
    const existing = await this.findByEmail(email);
    if (existing) throw new ConflictException('A user with this email already exists');

    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const inviteToken = uuidv4();

    const user = this.userRepo.create({
      email,
      name,
      passwordHash,
      role,
      inviteToken,
      isActivated: role === UserRole.ADMIN || forceActivate,
    });
    const saved = await this.userRepo.save(user);

    // Create onboarding record
    const onboarding = this.onboardingRepo.create({ userId: saved.id });
    await this.onboardingRepo.save(onboarding);

    return { user: saved, inviteToken };
  }

  async createOrRefreshInvite(email: string, name: string, tempPassword: string) {
    const existing = await this.findByEmail(email);

    if (!existing) {
      return this.createUser(email, name, tempPassword);
    }

    if (existing.isActivated) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const inviteToken = uuidv4();

    await this.userRepo.update(existing.id, {
      name: name || existing.name,
      passwordHash,
      inviteToken,
      isActivated: false,
    });

    await this.getOnboarding(existing.id);
    const user = await this.findById(existing.id);
    return { user, inviteToken };
  }

  async activate(userId: number, passwordHash: string) {
    await this.userRepo.update(userId, { isActivated: true, passwordHash, inviteToken: null });
  }

  async updatePassword(userId: number, passwordHash: string) {
    await this.userRepo.update(userId, { passwordHash });
  }

  async updateProfile(userId: number, data: Partial<User>) {
    await this.userRepo.update(userId, data);
    const user = await this.findById(userId);
    const { passwordHash, inviteToken, ...safe } = user;
    return safe;
  }

  async getOnboarding(userId: number): Promise<OnboardingProgress> {
    let ob = await this.onboardingRepo.findOne({ where: { userId } });
    if (!ob) {
      ob = this.onboardingRepo.create({ userId });
      await this.onboardingRepo.save(ob);
    }
    return ob;
  }

  async updateOnboarding(userId: number, updates: Partial<OnboardingProgress>) {
    const ob = await this.getOnboarding(userId);
    await this.onboardingRepo.update(ob.id, updates);
    return this.getOnboarding(userId);
  }

  async computeOnboardingPercent(userId: number): Promise<number> {
    const ob = await this.getOnboarding(userId);
    const steps = [ob.hasProfileImage, ob.hasHeightWeight, ob.hasPRs];
    const completed = steps.filter(Boolean).length;
    return Math.round((completed / steps.length) * 100);
  }

  /**
   * Delete an account and everything keyed to it.
   *
   * This used to be `userRepo.delete(userId)` alone, which left every dependent
   * row behind — and SQLite hands the freed id straight to the next account, so
   * the orphaned `onboarding_progress` row (unique on `userId`) made the next
   * signup fail with a 500. P9 found it, but it has been true since v1.
   *
   * The sweep is driven by `sqlite_master` rather than a hand-written list of
   * repositories, because a hand-written list is exactly what went stale: every
   * new table that keys off `userId` would have to remember to add itself here.
   * It cannot outrun the schema.
   */
  async deleteUser(userId: number) {
    const db = this.userRepo.manager;
    // Sets hang off the session, not the user, so they go first.
    await db.query(
      'DELETE FROM workout_sets WHERE sessionId IN (SELECT id FROM gym_sessions WHERE userId = ?)',
      [userId],
    );
    // …as do post reactions and comments, which key off the session too.
    for (const table of ['post_reactions', 'post_comments']) {
      await db.query(
        `DELETE FROM ${table} WHERE userId = ? OR sessionId IN (SELECT id FROM gym_sessions WHERE userId = ?)`,
        [userId, userId],
      );
    }
    await db.query('DELETE FROM friendships WHERE requesterId = ? OR addresseeId = ?', [
      userId,
      userId,
    ]);
    // Whoever they referred keeps their account; they just lose the referrer.
    await db.query('UPDATE users SET referredByUserId = NULL WHERE referredByUserId = ?', [userId]);

    const tables: { name: string }[] = await db.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    );
    for (const { name } of tables) {
      if (name === 'users') continue;
      const cols: { name: string }[] = await db.query(`PRAGMA table_info(${name})`);
      if (cols.some((c) => c.name === 'userId')) {
        await db.query(`DELETE FROM ${name} WHERE userId = ?`, [userId]);
      }
    }

    await this.userRepo.delete(userId);
  }

  /**
   * One-off sweep for rows already orphaned by the old delete (above).
   *
   * Only `onboarding_progress` is swept: it is the one with a unique index on
   * `userId`, so it is the one that actively breaks the next signup. Other
   * orphans are unreachable rather than harmful, and a blanket delete over a
   * production database is not a thing to do casually.
   */
  async sweepOrphanedOnboarding(): Promise<number> {
    const db = this.userRepo.manager;
    const [{ n }] = await db.query(
      'SELECT COUNT(*) AS n FROM onboarding_progress WHERE userId NOT IN (SELECT id FROM users)',
    );
    if (n > 0) {
      await db.query('DELETE FROM onboarding_progress WHERE userId NOT IN (SELECT id FROM users)');
    }
    return Number(n) || 0;
  }

  async adminResetPassword(userId: number, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userRepo.update(userId, { passwordHash });
  }
}

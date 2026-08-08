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

  /**
   * Look an account up by email, **case-insensitively**.
   *
   * SQLite's default collation is BINARY, so a plain equality match makes
   * `Foo@Gmail.com` and `foo@gmail.com` two different people. That was survivable
   * while the only door was a password form the user typed the same way each
   * time; it stops being survivable now that Clerk matches returning users on
   * their email (`AuthService.loginWithClerk`) and hands back whatever casing the
   * identity provider stores. A miss there does not error — it silently creates a
   * second, empty account and strands the real history on the first one.
   *
   * Fixed here rather than at the Clerk call site because every caller wants it:
   * `login` should accept the address as typed, and `createUser`'s duplicate
   * check should refuse a second account that differs only in case.
   */
  async findByEmail(email: string): Promise<User> {
    const normalised = String(email ?? '').trim().toLowerCase();
    if (!normalised) return null;
    return this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: normalised })
      .getOne();
  }

  /** The linked-account fast path once someone has signed in through Clerk before. */
  async findByClerkUserId(clerkUserId: string): Promise<User> {
    if (!clerkUserId) return null;
    return this.userRepo.findOne({ where: { clerkUserId } });
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
   * Sweep rows already orphaned by the old delete (above).
   *
   * This is not housekeeping — it is a correctness fix. SQLite hands a deleted
   * account's id to the next one created, so an orphaned row is not merely
   * unreachable: it gets **adopted**. On dev a brand-new account turned up
   * holding a deleted tester's sessions, PRs and Wilks score, which is how this
   * was found. `onboarding_progress` was only the loudest symptom (it is unique
   * on `userId`, so it 500s the signup instead of corrupting it quietly).
   *
   * Deleting a row whose owner does not exist can lose nothing that any account
   * can still reach.
   */
  async sweepOrphanedRows(): Promise<Record<string, number>> {
    const db = this.userRepo.manager;
    const swept: Record<string, number> = {};

    const sweep = async (table: string, where: string) => {
      const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`);
      if (Number(n) > 0) {
        await db.query(`DELETE FROM ${table} WHERE ${where}`);
        swept[table] = Number(n);
      }
    };

    const tables: { name: string }[] = await db.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    );
    const names = tables.map((t) => t.name);

    const columns = new Map<string, string[]>();
    for (const name of names) {
      const cols: { name: string }[] = await db.query(`PRAGMA table_info(${name})`);
      columns.set(name, cols.map((c) => c.name));
    }

    // Users first, then the rows that hang off a session — in that order, so a
    // session orphaned in this pass takes its sets with it in the same pass
    // rather than on the next boot.
    for (const name of names) {
      if (name === 'users') continue;
      if (columns.get(name).includes('userId')) {
        await sweep(name, 'userId NOT IN (SELECT id FROM users)');
      }
    }
    for (const name of names) {
      if (columns.get(name).includes('sessionId')) {
        await sweep(name, 'sessionId NOT IN (SELECT id FROM gym_sessions)');
      }
    }
    if (names.includes('friendships')) {
      await sweep(
        'friendships',
        'requesterId NOT IN (SELECT id FROM users) OR addresseeId NOT IN (SELECT id FROM users)',
      );
    }
    return swept;
  }

  async adminResetPassword(userId: number, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userRepo.update(userId, { passwordHash });
  }
}

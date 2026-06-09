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

  async deleteUser(userId: number) {
    await this.userRepo.delete(userId);
  }

  async adminResetPassword(userId: number, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userRepo.update(userId, { passwordHash });
  }
}

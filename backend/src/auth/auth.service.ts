import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/user.entity';
import { RanksService } from '../ranks/ranks.service';
import { SocialService, USERNAME_RE, slugifyUsername } from '../social/social.service';

/** The whole onboarding funnel, submitted in one shot at step 26 (SPEC §3.3). */
export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  /** Claimed at signup (SPEC §8). Derived from the name when the field is left blank. */
  username?: string;
  /** A friend's referral code, if they arrived through an invite link. */
  referralCode?: string;
  sex?: string;
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
  avatarId?: string;
  experience?: string;
  goal?: string;
  trainingLocation?: string;
  equipment?: string[];
  limitations?: string[];
  /** The lift ranked at step 21, so the rank the reveal promised actually exists. */
  firstRank?: { exerciseId?: string; weightKg?: number; reps?: number };
  /** Whichever of kg/lb and cm/ft they answered the funnel in. */
  units?: string;
}

/**
 * Allow-lists for every free-form profile field the funnel can send.
 *
 * This is a trust boundary and `sex` in particular is not cosmetic — it picks
 * the strength-standards column, so a junk value would silently mis-rank
 * someone forever. Anything unrecognised is dropped, not stored.
 */
const ENUMS: Record<string, readonly string[]> = {
  sex: ['male', 'female'],
  experience: ['never', 'beginner', 'intermediate', 'advanced'],
  goal: ['muscle', 'strength', 'fat_loss', 'health', 'athletic'],
  trainingLocation: ['big_gym', 'small_gym', 'home', 'outdoors', 'travelling'],
};
const EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell', 'band', 'plate'];
const LIMITATIONS = ['back', 'knees', 'shoulders', 'wrists'];

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const pickList = (v: unknown, allowed: string[]) =>
  Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => allowed.includes(x)))) : null;

const inRange = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && isFinite(v) && v >= min && v <= max ? v : null;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
    private ranks: RanksService,
    // Usernames and referral codes are P9's rules; signup is just another caller.
    private social: SocialService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return null;
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    if (!user.isActivated) throw new UnauthorizedException('Account not yet activated. Check your invitation email.');

    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_EXPIRY') || '30d',
    });

    return { token, user: this.sanitize(user) };
  }

  /**
   * Self-serve signup at the end of the onboarding funnel. v1 was invite-only
   * (`activateAccount`); that path stays for existing invites.
   */
  async register(dto: RegisterDto) {
    const email = String(dto?.email ?? '').trim().toLowerCase();
    const password = String(dto?.password ?? '');
    const name = String(dto?.name ?? '').trim();

    if (!EMAIL_RE.test(email)) throw new BadRequestException('Enter a valid email address');
    if (password.length < MIN_PASSWORD)
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD} characters`);
    if (!name) throw new BadRequestException('Name is required');

    // Resolve the handle *before* creating the account: a taken username must
    // 409 with nothing written, not leave a half-made user behind.
    const wanted = String(dto?.username ?? '').trim().toLowerCase();
    if (wanted && !USERNAME_RE.test(wanted)) {
      throw new BadRequestException('Username must be 3–20 characters: a–z, 0–9 or _');
    }
    if (wanted && (await this.usersService.findByUsername(wanted))) {
      throw new ConflictException('That username is taken');
    }

    // createUser throws ConflictException if the email is taken.
    const { user } = await this.usersService.createUser(email, name, password, UserRole.USER, true);

    const profile: Partial<User> = {
      username: wanted || (await this.social.freeUsername(slugifyUsername(name))),
      referralCode: await this.social.freeReferralCode(),
    };
    for (const [field, allowed] of Object.entries(ENUMS)) {
      const v = (dto as any)[field];
      if (typeof v === 'string' && allowed.includes(v)) (profile as any)[field] = v;
    }
    const equipment = pickList(dto.equipment, EQUIPMENT);
    const limitations = pickList(dto.limitations, LIMITATIONS);
    if (equipment?.length) profile.equipment = JSON.stringify(equipment);
    if (limitations) profile.limitations = JSON.stringify(limitations);
    const height = inRange(dto.heightCm, 90, 260);
    const weight = inRange(dto.weightKg, 25, 400);
    if (height !== null) profile.heightCm = height;
    if (weight !== null) profile.weightKg = weight;
    // Date-only string; the rank engine reads it for the age coefficient.
    if (typeof dto.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dto.birthDate))
      profile.birthDate = dto.birthDate;
    if (typeof dto.avatarId === 'string' && dto.avatarId.length <= 32) profile.avatarId = dto.avatarId;
    // The funnel's lb/ft answer becomes the Units preference. Written as the
    // whole blob because this is the account's first one; `PATCH /profile`
    // merges from here on.
    if (dto.units === 'imperial' || dto.units === 'metric')
      profile.preferences = JSON.stringify({ units: dto.units });

    if (Object.keys(profile).length) await this.usersService.updateProfile(user.id, profile);

    // v1's "Profile N% complete" banner tracks a different, older checklist. The
    // v2 funnel *is* onboarding, so an account that came through it is done —
    // otherwise a user who just answered twenty questions lands on a nag.
    await this.usersService.updateOnboarding(user.id, {
      hasHeightWeight: height !== null && weight !== null,
      dismissed: true,
    });

    await this.recordFirstLift(user.id, dto.firstRank);

    // Best-effort: an unknown or malformed code is not a reason to fail a signup
    // the user has already answered twenty questions for.
    if (dto.referralCode) {
      await this.social
        .claimReferral(user.id, String(dto.referralCode))
        .catch((err) => this.logger.warn(`referral not claimed: ${err?.message ?? err}`));
    }

    const fresh = await this.usersService.findById(user.id);
    const payload = { sub: fresh.id, email: fresh.email, role: fresh.role };
    const token = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_EXPIRY') || '30d',
    });
    return { token, user: this.sanitize(fresh) };
  }

  /**
   * Store the onboarding lift as one real logged set.
   *
   * Ranks are derived from `workout_sets` and nothing else (see MEMORY →
   * Decisions), so without this the funnel tells someone they are Silver III on
   * bench press and then hands them an empty Ranks tab. Best-effort: a failure
   * here must not cost the user the account they just created.
   */
  private async recordFirstLift(userId: number, lift: RegisterDto['firstRank']) {
    const exerciseId = typeof lift?.exerciseId === 'string' ? lift.exerciseId : null;
    const weightKg = inRange(lift?.weightKg, 0, 1000);
    const reps = inRange(lift?.reps, 1, 100);
    if (!exerciseId || weightKg === null || reps === null) return;

    try {
      await this.ranks.recordLift(userId, exerciseId, weightKg, reps, 'Onboarding');
    } catch (err) {
      this.logger.warn(`first lift not recorded for user ${userId}: ${err?.message ?? err}`);
    }
  }

  async activateAccount(token: string, newPassword: string) {
    const user = await this.usersService.findByInviteToken(token);
    if (!user) throw new BadRequestException('Invalid or expired invitation token');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.usersService.activate(user.id, passwordHash);

    const payload = { sub: user.id, email: user.email, role: user.role };
    const jwtToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_EXPIRY') || '30d',
    });

    return { token: jwtToken, user: this.sanitize(user) };
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await this.usersService.findById(userId);
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) throw new BadRequestException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.usersService.updatePassword(userId, passwordHash);
    return { message: 'Password changed successfully' };
  }

  async me(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  private sanitize(user: User) {
    const { passwordHash, inviteToken, ...safe } = user;
    return safe;
  }
}

import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/user.entity';
import { SocialService, USERNAME_RE, slugifyUsername } from '../social/social.service';
import { ClerkService } from './clerk.service';
import { resolveClerkAccount, __selfcheck as clerkResolveSelfcheck } from './clerk-resolve';

/**
 * Signup, which is now **identity only**.
 *
 * The onboarding funnel used to be submitted here in one shot at its last step,
 * which meant answering twenty questions before an account existed and being
 * asked to sign up at the *end* of the journey. The order is reversed: an
 * account is created first, at `/sign-up`, and the funnel's answers arrive
 * afterwards as a patch on it (`PATCH /profile`, `ProfileService.update`).
 * That is also where their allow-lists live now.
 */
export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  /** Claimed at signup (SPEC §8). Derived from the name when the field is left blank. */
  username?: string;
  /** A friend's referral code, if they arrived through an invite link. */
  referralCode?: string;
  /**
   * A Clerk session token, when the account is being created from a Clerk
   * sign-up rather than a typed password. It replaces both `email` and
   * `password`: the address comes from Clerk (verified) and there is no password
   * to set, because Clerk holds the credential from here on.
   */
  clerkToken?: string;
}

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Same convention as the rank, recovery and generator engines: the assertions
   * run at boot and a failure takes the service down on purpose. An auth path
   * that silently resolves to the wrong account is worse than one that will not
   * start.
   */
  onModuleInit() {
    this.logger.log(clerkResolveSelfcheck());
  }

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
    // Usernames and referral codes are P9's rules; signup is just another caller.
    private social: SocialService,
    private clerk: ClerkService,
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
    // A Clerk signup carries no password and does not get to choose its own
    // address: both come from the verified identity. Anything the client sent in
    // those two fields is ignored rather than merged, or the funnel would be a
    // way to claim an email you have not proven you own.
    const identity = dto?.clerkToken ? await this.clerk.identify(dto.clerkToken) : null;

    const email = identity ? identity.email : String(dto?.email ?? '').trim().toLowerCase();
    const password = identity ? null : String(dto?.password ?? '');
    const name = String(dto?.name ?? '').trim() || (identity?.name ?? '');

    if (!EMAIL_RE.test(email)) throw new BadRequestException('Enter a valid email address');
    if (!identity && password.length < MIN_PASSWORD)
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD} characters`);
    if (!name) throw new BadRequestException('Name is required');

    // Signing up through Clerk with an address that already has an account is
    // not an error — it is the returning user this whole feature exists for. Log
    // them in and link, exactly as `loginWithClerk` would.
    if (identity) {
      const existing = await this.usersService.findByEmail(email);
      if (existing) return this.loginWithClerk(dto.clerkToken);
    }

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
    // A Clerk account still gets a password hash, of a random secret nobody
    // holds — the column is NOT NULL and `bcrypt.compare` must have something
    // real to fail against. It means password login simply never matches for
    // these accounts, which is correct: Clerk is their credential. Setting one
    // later goes through the existing change-password path.
    const { user } = await this.usersService.createUser(
      email,
      name,
      password ?? randomBytes(32).toString('hex'),
      UserRole.USER,
      true,
    );

    const profile: Partial<User> = {
      username: wanted || (await this.social.freeUsername(slugifyUsername(name))),
      referralCode: await this.social.freeReferralCode(),
    };
    if (identity) profile.clerkUserId = identity.clerkUserId;

    await this.usersService.updateProfile(user.id, profile);

    // v1's "Profile N% complete" banner tracks a different, older checklist. The
    // v2 funnel *is* onboarding, and this account is on its way into it — so it
    // must not also land on a nag telling it to complete a profile.
    await this.usersService.updateOnboarding(user.id, { dismissed: true });

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
   * Sign in with a Clerk session token.
   *
   * **Email is the identity.** The resolution order is deliberate:
   *
   * 1. `clerkUserId` — already linked, nothing to decide.
   * 2. **verified email** — this is the case the owner asked for. Everyone who
   *    had an account before Clerk existed signs in through a provider we have
   *    never seen (Google, a magic code, a new Clerk password), and none of that
   *    tells us who they are. Their email does. Matching on it links the new
   *    sign-in method to the account they already had, so they land on their own
   *    workouts, ranks and streak instead of a convincing empty app.
   * 3. no match — a genuinely new person. We do *not* invent an account here:
   *    the rank engine needs sex, birth date and bodyweight to score anything, so
   *    they go through the existing `/welcome` funnel, which finishes by calling
   *    `register` with the same Clerk token.
   *
   * The link is written once and never rewritten. `ClerkService` has already
   * refused anything but a provider-verified address, which is what stops this
   * from being an account-takeover primitive.
   */
  async loginWithClerk(clerkToken: string) {
    const identity = await this.clerk.identify(clerkToken);

    const byClerkId = await this.usersService.findByClerkUserId(identity.clerkUserId);
    const byEmail = byClerkId ? null : await this.usersService.findByEmail(identity.email);
    const decision = resolveClerkAccount(byClerkId, byEmail, identity.clerkUserId);

    if (decision.action === 'conflict') {
      throw new ConflictException(
        'This email is already linked to a different sign-in. Sign in with the method you used before.',
      );
    }
    if (decision.action === 'signup') {
      // Not an error — the frontend sends them into the signup funnel with this.
      return { needsSignup: true as const, email: identity.email, name: identity.name };
    }

    const user = byClerkId ?? byEmail;
    const linked = decision.action === 'link-then-signin';
    if (linked) {
      await this.usersService.updateProfile(user.id, { clerkUserId: identity.clerkUserId });
      this.logger.log(`Clerk linked to existing account ${user.id} by verified email`);
    }

    if (!user.isActivated) {
      // An outstanding invite that was never activated: proving the email through
      // Clerk is at least as strong as clicking the emailed link, so honour it
      // instead of dead-ending them on "check your invitation email".
      await this.usersService.updateProfile(user.id, { isActivated: true });
    }

    const fresh = await this.usersService.findById(user.id);
    const payload = { sub: fresh.id, email: fresh.email, role: fresh.role };
    const token = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_EXPIRY') || '30d',
    });
    return { token, user: this.sanitize(fresh), linked, needsSignup: false as const };
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

  /** Advertised to the login screen so it only offers doors that exist here. */
  providers() {
    return { password: true, clerk: this.clerk.enabled };
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

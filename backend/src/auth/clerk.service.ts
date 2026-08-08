import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, verifyToken } from '@clerk/backend';

/** What the rest of the app is allowed to believe about a Clerk sign-in. */
export interface ClerkIdentity {
  clerkUserId: string;
  /** Primary email, lowercased. The identity key — see `AuthService.loginWithClerk`. */
  email: string;
  name: string;
  imageUrl?: string;
}

/**
 * Verifies a Clerk session token and turns it into a trusted identity.
 *
 * Two deliberate choices:
 *
 * 1. **The email is fetched from Clerk's API, not read off the token.** A stock
 *    Clerk session token carries `sub` and `sid` and no email at all; an email
 *    claim only exists if someone adds it to the JWT template, and a claim that
 *    can be configured away is not something to key account matching on. So we
 *    verify the token for its `sub`, then ask Clerk who that is.
 *
 * 2. **An unverified email is rejected outright.** Matching an existing account
 *    by email is the whole point of this file, which makes the email a trust
 *    boundary: if Clerk let someone sign up claiming `victim@example.com`
 *    without proving they own it, that signup would inherit the victim's
 *    training history, ranks and friends. Clerk marks each address
 *    `verification.status`; anything but `verified` is refused here rather than
 *    somewhere further in.
 */
@Injectable()
export class ClerkService {
  private readonly logger = new Logger(ClerkService.name);
  private readonly secretKey?: string;
  private client?: ReturnType<typeof createClerkClient>;

  constructor(private config: ConfigService) {
    const key = this.config.get<string>('CLERK_SECRET_KEY');
    // The placeholder in .env.example must not count as configured, or a Pi that
    // has not been given real keys would advertise a sign-in door that 500s.
    this.secretKey = key && key.startsWith('sk_') ? key : undefined;
    if (this.secretKey) {
      this.client = createClerkClient({ secretKey: this.secretKey });
      this.logger.log('Clerk sign-in enabled');
    } else {
      this.logger.warn('CLERK_SECRET_KEY not configured; Clerk sign-in disabled (password login unaffected)');
    }
  }

  /** Whether Clerk is usable on this deployment. Published by `GET /auth/providers`. */
  get enabled(): boolean {
    return Boolean(this.secretKey);
  }

  async identify(token: string): Promise<ClerkIdentity> {
    if (!this.enabled) throw new ServiceUnavailableException('Clerk sign-in is not configured on this server');
    if (!token || typeof token !== 'string') throw new UnauthorizedException('Missing Clerk session token');

    let clerkUserId: string;
    try {
      const claims = await verifyToken(token, { secretKey: this.secretKey });
      clerkUserId = String(claims.sub || '');
    } catch (err) {
      // Expired or forged — both are "sign in again", never a 500.
      this.logger.warn(`Clerk token rejected: ${err instanceof Error ? err.message : String(err)}`);
      throw new UnauthorizedException('That sign-in session is no longer valid. Please sign in again.');
    }
    if (!clerkUserId) throw new UnauthorizedException('Clerk session token carried no user');

    const user = await this.client.users.getUser(clerkUserId);

    // Prefer the primary address; fall back to the first *verified* one so a
    // user whose primary is mid-verification is not silently matched on it.
    const addresses = user.emailAddresses || [];
    const primary = addresses.find((a) => a.id === user.primaryEmailAddressId);
    const chosen =
      primary && primary.verification?.status === 'verified'
        ? primary
        : addresses.find((a) => a.verification?.status === 'verified');

    if (!chosen) {
      throw new UnauthorizedException(
        'Please verify your email address with your sign-in provider before continuing.',
      );
    }

    const name =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.username ||
      chosen.emailAddress.split('@')[0];

    return {
      clerkUserId,
      email: chosen.emailAddress.trim().toLowerCase(),
      name,
      imageUrl: user.imageUrl || undefined,
    };
  }
}

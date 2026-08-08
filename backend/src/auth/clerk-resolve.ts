/**
 * The decision at the centre of Clerk sign-in: *which account is this?*
 *
 * Split out from `AuthService.loginWithClerk` because it is the one piece here
 * with a security consequence — get it wrong in one direction and a returning
 * user is handed a stranger's training history; get it wrong in the other and
 * they silently start again with an empty account and no way to tell why. The
 * database lookups stay in the service; this is only the choice, so it can be
 * asserted without a database.
 */

export type ClerkResolution =
  | { action: 'signin'; reason: 'linked' }
  | { action: 'link-then-signin'; reason: 'email' }
  | { action: 'signup'; reason: 'unknown-email' }
  | { action: 'conflict'; reason: 'email-linked-elsewhere' };

export interface AccountShape {
  id: number;
  clerkUserId?: string | null;
}

/**
 * @param byClerkId account already linked to this Clerk user, if any
 * @param byEmail   account holding this verified email, if any
 * @param clerkUserId the Clerk user signing in
 */
export function resolveClerkAccount(
  byClerkId: AccountShape | null,
  byEmail: AccountShape | null,
  clerkUserId: string,
): ClerkResolution {
  // 1. Already linked. Nothing to decide, and it must win over the email lookup
  //    — a user who changed their email address in Clerk is still the same
  //    person, and the link is the stronger statement.
  if (byClerkId) return { action: 'signin', reason: 'linked' };

  if (byEmail) {
    // 2. The address belongs to a *different* Clerk identity. Re-pointing the
    //    link would hand the account to whoever signed in most recently, so
    //    refuse instead. Only reachable when someone owns the address on two
    //    separate Clerk users.
    if (byEmail.clerkUserId && byEmail.clerkUserId !== clerkUserId) {
      return { action: 'conflict', reason: 'email-linked-elsewhere' };
    }
    // 3. The case this feature exists for: an account that predates Clerk,
    //    found by its verified email, linked on first sign-in.
    return { action: 'link-then-signin', reason: 'email' };
  }

  // 4. Nobody here by that address.
  return { action: 'signup', reason: 'unknown-email' };
}

/** Run at boot beside the other engines' checks (`AuthService.onModuleInit`). */
export function __selfcheck() {
  const eq = (got: ClerkResolution, want: ClerkResolution['action'], label: string) => {
    if (got.action !== want) throw new Error(`clerk-resolve: ${label} → ${got.action}, expected ${want}`);
  };

  // A returning user whose account was made with a password: matched on email.
  eq(resolveClerkAccount(null, { id: 5 }, 'user_abc'), 'link-then-signin', 'legacy account by email');

  // Second sign-in: the link now exists and short-circuits.
  eq(resolveClerkAccount({ id: 5, clerkUserId: 'user_abc' }, { id: 5, clerkUserId: 'user_abc' }, 'user_abc'), 'signin', 'already linked');

  // Genuinely new person.
  eq(resolveClerkAccount(null, null, 'user_new'), 'signup', 'unknown email');

  // The address is spoken for by another Clerk identity — refuse, never re-point.
  eq(resolveClerkAccount(null, { id: 5, clerkUserId: 'user_other' }, 'user_abc'), 'conflict', 'email linked elsewhere');

  // Linked account wins even when the email now points somewhere else, which is
  // what happens after someone changes their address in Clerk. Without the
  // ordering in step 1 this would hand them whoever inherited the old address.
  eq(
    resolveClerkAccount({ id: 5, clerkUserId: 'user_abc' }, { id: 9, clerkUserId: null }, 'user_abc'),
    'signin',
    'link beats a stale email match',
  );

  return 'clerk resolve ok';
}

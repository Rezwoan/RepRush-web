'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ClerkProvider, useAuth as useClerkAuth, useClerk, useUser as useClerkUser } from '@clerk/nextjs';
import { authApi } from '@/lib/api';
import { setToken, getToken } from '@/lib/token';
import { useAuth } from '@/lib/auth-context';
import { readReferralCode } from '@/lib/referral';
import { registerClerkSignOut } from '@/lib/clerk-signout';

/**
 * Whether Clerk is configured for this deployment. Read at module scope because
 * `NEXT_PUBLIC_*` is inlined at build time — there is nothing dynamic to react
 * to, and reading it during render would be the same value every time anyway.
 */
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Turns a Clerk session into a RepRush session.
 *
 * Clerk proves *who someone is*; the RepRush JWT is what the app actually runs
 * on — the outbox stamps it on every queued write, the guards check it, and the
 * offline boot reads the profile it cached. So the moment Clerk says "signed in"
 * and we have no RepRush token, exchange one.
 *
 * The exchange is what makes a returning user land on their own account: the
 * backend matches the verified email against the existing row
 * (`AuthService.loginWithClerk`).
 */
function ClerkBridge() {
  const { isLoaded, isSignedIn, getToken: getClerkToken } = useClerkAuth();
  const { signOut } = useClerk();
  const { user: clerkUser } = useClerkUser();
  const { user, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // One exchange per mount. Without this, `refresh()` updating the context
  // re-runs the effect and fires a second exchange against the same Clerk
  // session while the first is still in flight.
  const exchanging = useRef(false);

  // Hand `signOut` to auth-context, which cannot reach Clerk itself.
  useEffect(() => {
    registerClerkSignOut(signOut);
    return () => registerClerkSignOut(null);
  }, [signOut]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (user || getToken()) return; // already have a RepRush session
    if (exchanging.current) return;
    exchanging.current = true;

    (async () => {
      try {
        const clerkToken = await getClerkToken();
        if (!clerkToken) return;
        const res = await authApi.clerk(clerkToken);

        if (res.data?.needsSignup) {
          /*
           * Verified by Clerk, and nobody here by that address yet — so create
           * the account now, before anything else asks them for anything.
           *
           * This used to send them into `/welcome` to answer twenty questions
           * and sign up at the *end*. The order is reversed: the account exists
           * from this moment, and `/welcome?setup=1` is profile setup for it. It
           * is also why this lives here rather than on `/sign-up` — the OAuth
           * callback, the email flow and any future door all pass through this
           * one exchange.
           *
           * The name is a placeholder the funnel overwrites within the minute;
           * it is only here because the account needs *something* to derive a
           * handle from, and an email's local part makes a better one than
           * "athlete".
           */
          const name =
            clerkUser?.firstName ||
            clerkUser?.username ||
            clerkUser?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
            'Athlete';
          const created = await authApi.register({
            clerkToken,
            name,
            // Captured on `/welcome?ref=CODE`, three screens and one redirect ago.
            referralCode: readReferralCode() || undefined,
          });
          if (created.data?.token) {
            setToken(created.data.token);
            await refresh();
          }
          router.replace('/welcome?setup=1');
          return;
        }
        if (res.data?.token) {
          setToken(res.data.token);
          await refresh();
        }
      } catch {
        // A failed exchange must not strand someone on a blank screen. Anywhere
        // else in the app that is survivable — they keep the session they had.
        // On the two screens that render nothing *but* this handshake it is a
        // dead loader, so those go back to a form they can act on.
        if (pathname === '/sso-callback' || pathname === '/sign-up') {
          router.replace('/login?error=clerk');
        }
      } finally {
        exchanging.current = false;
      }
    })();
  }, [isLoaded, isSignedIn, user, clerkUser, getClerkToken, refresh, router, pathname]);

  return null;
}

/**
 * Is a verified Clerk session present?
 *
 * The one thing outside this file that still needs to know: `/welcome` must
 * tell "no account, show the pitch" apart from "account on its way, wait for
 * the bridge". It used to hand out the email, the name and a token as well,
 * because the funnel did the registering; the bridge above does that now.
 *
 * The implementation is chosen **once, at module load**, from a build-time
 * constant. That matters: `useClerkAuth()` throws outside `<ClerkProvider>`, and
 * the provider is only mounted when a key exists — so a runtime `if` inside the
 * hook would either break the rules of hooks or crash an unconfigured build.
 * Binding the whole hook up front keeps the call order identical on every render
 * of every deployment.
 */
export const useClerkSignedIn: () => boolean = clerkEnabled
  ? () => {
      const { isLoaded, isSignedIn } = useClerkAuth();
      return Boolean(isLoaded && isSignedIn);
    }
  : () => false;

/**
 * Mounts `<ClerkProvider>` — but only when a publishable key exists.
 *
 * `<ClerkProvider>` throws without one, so an unconfigured deployment (a fresh
 * clone, a Pi that has not been given keys yet) would white-screen the entire
 * app rather than fall back. Gating here keeps Clerk strictly additive: no key,
 * no Clerk, password login untouched.
 */
export function ClerkGate({ children }: { children: React.ReactNode }) {
  if (!clerkEnabled) return <>{children}</>;
  return (
    <ClerkProvider
      signInUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/login'}
      signUpUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || '/sign-up'}
    >
      <ClerkBridge />
      {children}
    </ClerkProvider>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ClerkProvider, useAuth as useClerkAuth, useClerk, useUser as useClerkUser } from '@clerk/nextjs';
import { authApi } from '@/lib/api';
import { setToken, getToken } from '@/lib/token';
import { useAuth } from '@/lib/auth-context';
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
  const { user, refresh } = useAuth();
  const router = useRouter();
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
          // Verified, but nobody here by that address. The rank engine needs a
          // sex, a birth date and a bodyweight before it can score anything, so
          // send them through the funnel rather than inventing a hollow account.
          router.replace('/welcome?clerk=1');
          return;
        }
        if (res.data?.token) {
          setToken(res.data.token);
          await refresh();
        }
      } catch {
        // A failed exchange must not strand someone on a blank screen: leave the
        // Clerk session alone and let them use the login screen, which now shows
        // the password form as well.
      } finally {
        exchanging.current = false;
      }
    })();
  }, [isLoaded, isSignedIn, user, getClerkToken, refresh, router]);

  return null;
}

export interface ClerkSignup {
  /** A verified Clerk session is present and should drive signup. */
  active: boolean;
  email: string;
  name: string;
  /** The session token to hand `POST /auth/register` in place of a password. */
  getToken: () => Promise<string | null>;
}

const NO_CLERK: ClerkSignup = { active: false, email: '', name: '', getToken: async () => null };

function useClerkSignupImpl(): ClerkSignup {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user } = useClerkUser();
  if (!isLoaded || !isSignedIn || !user) return NO_CLERK;
  return {
    active: true,
    email: user.primaryEmailAddress?.emailAddress ?? '',
    name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || '',
    getToken: () => getToken(),
  };
}

/**
 * What the signup funnel needs to know about an in-progress Clerk session.
 *
 * The implementation is chosen **once, at module load**, from a build-time
 * constant. That matters: `useClerkAuth()` throws outside `<ClerkProvider>`, and
 * the provider is only mounted when a key exists — so a runtime `if` inside the
 * hook would either break the rules of hooks or crash an unconfigured build.
 * Binding the whole hook up front keeps the call order identical on every render
 * of every deployment.
 */
export const useClerkSignup: () => ClerkSignup = clerkEnabled ? useClerkSignupImpl : () => NO_CLERK;

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

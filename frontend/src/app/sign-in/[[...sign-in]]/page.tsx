'use client';

import { SignIn } from '@clerk/nextjs';
import { clerkAppearance } from '@/components/auth/clerk-appearance';
import { clerkEnabled } from '@/components/auth/clerk-gate';
import { AuthShell, ClerkNotConfigured } from '@/components/auth/auth-shell';

/**
 * Custom sign-in page — a catch-all route so Clerk owns its own sub-steps
 * (factor two, SSO callback) instead of 404ing on them.
 *
 * The subtitle is not decoration. Every account that exists today was made with
 * an email and a password, and this screen now offers Google and a one-time
 * code instead. Without a line saying the account is found by email, the honest
 * reading is "my history is gone, I have to start again".
 */
export default function SignInPage() {
  if (!clerkEnabled) return <ClerkNotConfigured />;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in any way you like — we find your account by email, so your workouts, ranks and streak come with you."
    >
      <SignIn
        appearance={clerkAppearance}
        signUpUrl="/sign-up"
        // Land on the app; ClerkGate's bridge does the token exchange.
        forceRedirectUrl="/home"
        fallbackRedirectUrl="/home"
      />
    </AuthShell>
  );
}

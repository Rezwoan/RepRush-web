'use client';

import { SignUp } from '@clerk/nextjs';
import { clerkAppearance } from '@/components/auth/clerk-appearance';
import { clerkEnabled } from '@/components/auth/clerk-gate';
import { AuthShell, ClerkNotConfigured } from '@/components/auth/auth-shell';

/**
 * Custom sign-up page.
 *
 * Signing up with an address that already has an account is not an error here —
 * it is the returning user this whole change exists for. The backend links the
 * two and signs them in (`AuthService.register` → `loginWithClerk`), so the copy
 * says so rather than letting someone worry they have made a duplicate.
 */
export default function SignUpPage() {
  if (!clerkEnabled) return <ClerkNotConfigured />;

  return (
    <AuthShell
      title="Create your account"
      subtitle="Already trained with us? Use the same email and we'll reconnect you to your existing history."
    >
      <SignUp
        appearance={clerkAppearance}
        signInUrl="/sign-in"
        // New accounts still owe us a sex, birth date and bodyweight before the
        // rank engine can score anything — that is what /welcome collects.
        forceRedirectUrl="/welcome?clerk=1"
        fallbackRedirectUrl="/welcome?clerk=1"
      />
    </AuthShell>
  );
}

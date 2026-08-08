'use client';
/**
 * Where Google sends people back to.
 *
 * A custom OAuth flow needs a landing route to finish the handshake on;
 * `<AuthenticateWithRedirectCallback/>` does that and then forwards. A brand-new
 * Google account goes to the funnel — `ClerkBridge` will have created the
 * RepRush account by the time it arrives — and a returning one goes home.
 */
import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import { clerkEnabled } from '@/components/auth/clerk-gate';
import { BrandLoader } from '@/components/ui/motion-primitives';

export default function SsoCallbackPage() {
  return (
    <>
      {clerkEnabled && (
        <AuthenticateWithRedirectCallback
          signUpForceRedirectUrl="/welcome?setup=1"
          signInForceRedirectUrl="/home"
          // The live Clerk instance marks `username` required, so a Google
          // signup arrives here *incomplete*. `/sign-up` fills it from the
          // address and finishes; without this the callback has nowhere to send
          // someone who has already approved the provider.
          continueSignUpUrl="/sign-up"
        />
      )}
      <BrandLoader />
    </>
  );
}

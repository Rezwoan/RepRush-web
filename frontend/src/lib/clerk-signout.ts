/**
 * A slot for Clerk's `signOut`, so `auth-context.logout()` can end the Clerk
 * session too without importing Clerk.
 *
 * Why a slot and not an import: `useClerk()` only works inside `<ClerkProvider>`,
 * and this app mounts that provider only when a publishable key is configured
 * (see `components/auth/clerk-gate.tsx`). `auth-context` is above it and runs on
 * every deployment, keys or not, so it cannot hold a Clerk hook.
 *
 * Without this, logging out clears the RepRush token while Clerk stays signed
 * in — and the bridge, doing exactly its job, immediately mints a new session
 * and puts the user straight back in. The Sign out button would look broken.
 */
type SignOut = () => Promise<unknown>;

let signOutFn: SignOut | null = null;

export function registerClerkSignOut(fn: SignOut | null) {
  signOutFn = fn;
}

/** Best-effort: never let a failed Clerk call stop the local sign-out. */
export async function clerkSignOut() {
  if (!signOutFn) return;
  try {
    await signOutFn();
  } catch {
    /* offline, or Clerk unreachable — the local token is cleared either way */
  }
}

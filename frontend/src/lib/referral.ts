/**
 * The referral code from an invite link (`/welcome?ref=CODE`).
 *
 * It has to be stored rather than passed along: the code arrives on the URL at
 * the splash screen and is not needed until the account is created, which now
 * happens a page later (`/sign-up`, then `ClerkBridge`). Anything held in React
 * state would be gone the moment we leave for Clerk.
 *
 * It lives in `lib/` rather than in the funnel's config because the funnel is no
 * longer the thing that creates accounts.
 */
const REF_KEY = 'reprush_referral_code';

export function captureReferralCode() {
  if (typeof window === 'undefined') return;
  try {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (code) window.localStorage.setItem(REF_KEY, code.trim().toUpperCase().slice(0, 12));
  } catch {
    /* private mode / quota */
  }
}

export function readReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

export function clearReferralCode() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(REF_KEY);
  } catch {
    /* ignore */
  }
}

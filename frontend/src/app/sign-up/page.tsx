'use client';
/**
 * Create an account. **This is the first thing a new user does**, not the last.
 *
 * The funnel at `/welcome` used to end here: twenty questions, three
 * celebration screens, and only then "now make an account" — so the app asked
 * for everything before giving anything, and the one screen that had to be
 * trusted arrived when attention was gone. `/welcome` now stops at its value
 * carousel and sends people here; what follows the signup is profile setup for
 * an account that already exists.
 *
 * **Google and Facebook lead.** They are the whole screen until someone asks
 * for anything else — one tap, no password to invent, no verification email to
 * go and find. Email is a text link under them that reveals two fields. Neither
 * door asks for a first and last name: the funnel asks for a name two screens
 * later, in the app's own voice.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSignUp } from '@clerk/nextjs';
import type { SignUpResource } from '@clerk/types';
import { useAuth } from '@/lib/auth-context';
import { authApi } from '@/lib/api';
import { setToken } from '@/lib/token';
import { readReferralCode } from '@/lib/referral';
import { clerkEnabled } from '@/components/auth/clerk-gate';
import { Button } from '@/components/ui/button';
import { BrandLoader } from '@/components/ui/motion-primitives';
import {
  AuthError,
  AuthScreen,
  CodeInput,
  Divider,
  SocialButtons,
  authField,
  clerkError,
} from '@/components/auth/auth-ui';

/**
 * The branch is on a build-time constant, so the hook order below never
 * changes — `useSignUp()` throws outside `<ClerkProvider>`, which is only
 * mounted when a key exists (same rule as `useClerkSignedIn`).
 */
export default function SignUpPage() {
  return clerkEnabled ? <ClerkSignUp /> : <PasswordSignUp />;
}

/** A Clerk handle from an email address: `Alex.Smith+gym@x.com` → `alexsmith`. */
const handleFromEmail = (email: string) =>
  (email.split('@')[0] || 'athlete').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'athlete';

/**
 * Satisfy whatever the Clerk instance still marks required, without putting it
 * on screen.
 *
 * This one is not hypothetical: `/v1/environment` on the live instance has
 * **username required**, so a signup that sends only an email and a password
 * comes back `missing_requirements` and never completes — and OAuth hits the
 * same wall after the provider hands control back. A handle derived from the
 * address is a better guess than anything typed in a hurry, it is changeable in
 * Settings, and RepRush derives its own handle separately anyway. Collisions are
 * Clerk's to report, so a taken one is retried with a suffix.
 */
async function fillRequiredFields(signUp: SignUpResource, email: string): Promise<SignUpResource> {
  const missing = (signUp.missingFields ?? []) as string[];
  let attempt = signUp;
  const patch: Record<string, string> = {};

  const base = handleFromEmail(email || signUp.emailAddress || '');
  if (missing.includes('first_name')) patch.firstName = base;
  if (missing.includes('last_name')) patch.lastName = base;
  if (missing.includes('username')) patch.username = base;
  if (!Object.keys(patch).length) return attempt;

  for (let i = 0; i < 4; i++) {
    try {
      return await attempt.update(patch);
    } catch (err) {
      const code = (err as { errors?: { code?: string }[] })?.errors?.[0]?.code;
      if (code !== 'form_identifier_exists' || !patch.username) throw err;
      patch.username = `${base.slice(0, 16)}${Math.floor(10 + Math.random() * 89)}`;
    }
  }
  return attempt;
}

function ClerkSignUp() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { user } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [phase, setPhase] = useState<'form' | 'code' | 'done'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // `ClerkBridge` turns the new Clerk session into a RepRush account and sends
  // it to `/welcome?setup=1`. An account that already exists (someone who came
  // here by habit) just goes home.
  useEffect(() => {
    if (user) router.replace('/home');
  }, [user, router]);

  /**
   * Finish an OAuth signup that came back needing a field.
   *
   * Clerk's redirect callback sends `missing_requirements` here rather than
   * completing, which without this would strand someone who has already
   * approved Google on a form asking them to start again.
   */
  const resuming = useRef(false);
  useEffect(() => {
    if (!isLoaded || resuming.current) return;
    if (signUp.status !== 'missing_requirements') return;
    resuming.current = true;
    (async () => {
      setBusy(true);
      try {
        const done = await fillRequiredFields(signUp, signUp.emailAddress ?? '');
        if (done.status === 'complete') {
          await setActive({ session: done.createdSessionId });
          setPhase('done');
          return;
        }
        if (done.unverifiedFields?.includes('email_address')) {
          await done.prepareEmailAddressVerification({ strategy: 'email_code' });
          setEmail(done.emailAddress ?? '');
          setPhase('code');
        }
      } catch (err) {
        setError(clerkError(err));
      } finally {
        setBusy(false);
      }
    })();
  }, [isLoaded, signUp, setActive]);

  const submit = async () => {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError('');
    try {
      let attempt = await signUp.create({ emailAddress: email.trim(), password });
      attempt = await fillRequiredFields(attempt, email.trim());

      // Email verification can be off on the instance, in which case there is
      // no code to ask for.
      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
        setPhase('done');
        return;
      }
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPhase('code');
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!isLoaded || busy || code.length < 6) return;
    setBusy(true);
    setError('');
    try {
      let attempt = await signUp.attemptEmailAddressVerification({ code });
      if (attempt.status !== 'complete') attempt = await fillRequiredFields(attempt, email);
      if (attempt.status !== 'complete') {
        setError('That code did not complete the signup. Try again.');
        return;
      }
      await setActive({ session: attempt.createdSessionId });
      setPhase('done');
    } catch (err) {
      setError(clerkError(err, 'That code is wrong or has expired.'));
    } finally {
      setBusy(false);
    }
  };

  const social = async (strategy: 'oauth_google' | 'oauth_facebook') => {
    if (!isLoaded) return;
    setError('');
    try {
      await signUp.authenticateWithRedirect({
        strategy,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/welcome?setup=1',
      });
    } catch (err) {
      setError(clerkError(err));
    }
  };

  if (!isLoaded || phase === 'done') return <BrandLoader />;

  if (phase === 'code')
    return (
      <AuthScreen
        title="Check your email"
        subtitle={
          <>
            We sent a six-digit code to <span className="font-semibold text-foreground">{email}</span>.
          </>
        }
        footer={
          <button type="button" onClick={() => setPhase('form')} className="font-semibold text-primary hover:underline">
            Use a different email
          </button>
        }
      >
        <CodeInput value={code} onChange={setCode} onEnter={verify} />
        <AuthError>{error}</AuthError>
        <Button variant="chunky" size="cta" disabled={busy || code.length < 6} onClick={verify}>
          {busy ? 'Verifying…' : 'Verify'}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          disabled={busy}
          onClick={() => signUp?.prepareEmailAddressVerification({ strategy: 'email_code' })}
        >
          Send it again
        </Button>
      </AuthScreen>
    );

  return (
    <AuthScreen
      title="Create your account"
      subtitle="One tap, then about two minutes of setup. Trained with us before? Use the same account and we'll reconnect your history."
      footer={
        <>
          Already have an account?{' '}
          <a href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </a>
        </>
      }
    >
      <SocialButtons onPick={social} disabled={busy} />

      {!showEmail ? (
        <>
          <AuthError>{error}</AuthError>
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="w-full pt-2 text-center text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Continue with email instead
          </button>
        </>
      ) : (
        <>
          <Divider label="or use email" />
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={authField}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Password (8+ characters)"
            className={authField}
          />
          <AuthError>{error}</AuthError>
          {/* Clerk's own CAPTCHA lands here when the instance has bot
              protection on. Without this element it refuses every signup. */}
          <div id="clerk-captcha" />
          <Button
            variant="chunkyOutline"
            size="cta"
            disabled={busy || !email.includes('@') || password.length < 8}
            onClick={submit}
          >
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </>
      )}
      <p className="pt-1 text-center text-[10px] text-muted-foreground/60">Secured by Clerk</p>
    </AuthScreen>
  );
}

/**
 * No Clerk keys on this deployment — sign up against this app's own database.
 *
 * This used to be a dead end pointing at `/login`, which meant a keyless
 * deployment (dev, or a Clerk outage) could not create an account at all. It
 * works now for the same reason the reshuffle above does: the funnel *patches*
 * a profile rather than registering one, so any door that produces a session
 * leads into it.
 */
function PasswordSignUp() {
  const { refresh } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await authApi.register({
        email: email.trim(),
        password,
        // A placeholder the funnel overwrites two screens later; it is only here
        // because the account needs something to derive a handle from.
        name: handleFromEmail(email.trim()),
        referralCode: readReferralCode() || undefined,
      });
      if (res.data?.token) setToken(res.data.token);
      await refresh();
      router.replace('/welcome?setup=1');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title="Create your account"
      subtitle="One account, then about two minutes of setup."
      footer={
        <>
          Already have an account?{' '}
          <a href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </a>
        </>
      }
    >
      <input
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className={authField}
      />
      <input
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Password (8+ characters)"
        className={authField}
      />
      <AuthError>{error}</AuthError>
      <Button
        variant="chunky"
        size="cta"
        disabled={busy || !email.includes('@') || password.length < 8}
        onClick={submit}
      >
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
    </AuthScreen>
  );
}

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
 * Two doors, stacked, full width: Google, or an email and a password. No first
 * and last name — the funnel asks for a name two screens later, in the app's
 * own voice, and asking twice was the sort of form-filling this rewrite exists
 * to delete. If the Clerk instance still *requires* a name, one is filled in
 * from the address rather than shown as two more fields.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSignUp } from '@clerk/nextjs';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { clerkEnabled } from '@/components/auth/clerk-gate';
import { Button } from '@/components/ui/button';
import { BrandLoader } from '@/components/ui/motion-primitives';
import {
  AuthError,
  AuthScreen,
  CodeInput,
  Divider,
  GoogleIcon,
  authField,
  clerkError,
} from '@/components/auth/auth-ui';

/**
 * The branch is on a build-time constant, so the hook order below never
 * changes — `useSignUp()` throws outside `<ClerkProvider>`, which is only
 * mounted when a key exists (same rule as `useClerkSignup`).
 */
export default function SignUpPage() {
  return clerkEnabled ? <ClerkSignUp /> : <NotConfigured />;
}

function ClerkSignUp() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { user } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'form' | 'code' | 'done'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // `ClerkBridge` turns the new Clerk session into a RepRush account and sends
  // it to `/welcome?setup=1`. An account that already exists (someone who came
  // here by habit) just goes home.
  useEffect(() => {
    if (user) router.replace('/home');
  }, [user, router]);

  const submit = async () => {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError('');
    try {
      let attempt = await signUp.create({ emailAddress: email.trim(), password });

      // Clerk's instance settings may still mark a name required. The funnel
      // asks for the real one within the minute and overwrites this, so it is
      // filled from the address rather than shown as two more fields.
      const missing = (attempt.missingFields ?? []) as string[];
      if (missing.includes('first_name') || missing.includes('last_name')) {
        const from = email.trim().split('@')[0].slice(0, 40) || 'Athlete';
        attempt = await signUp.update({ firstName: from, lastName: from });
      }

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
      const res = await signUp.attemptEmailAddressVerification({ code });
      if (res.status !== 'complete') {
        setError('That code did not complete the signup. Try again.');
        return;
      }
      await setActive({ session: res.createdSessionId });
      setPhase('done');
    } catch (err) {
      setError(clerkError(err, 'That code is wrong or has expired.'));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (!isLoaded) return;
    setError('');
    try {
      await signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
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
      subtitle="One account, then about two minutes of setup. Trained with us before? Use the same email and we'll reconnect your history."
      footer={
        <>
          Already have an account?{' '}
          <a href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </a>
        </>
      }
    >
      <Button variant="chunkyOutline" size="cta" onClick={google}>
        <GoogleIcon /> Continue with Google
      </Button>

      <Divider label="or" />

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
      {/* Clerk's own CAPTCHA lands here when the instance has bot protection
          on. Without this element it silently refuses every signup. */}
      <div id="clerk-captcha" />
      <Button
        variant="chunky"
        size="cta"
        disabled={busy || !email.includes('@') || password.length < 8}
        onClick={submit}
      >
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
      <p className="pt-1 text-center text-[10px] text-muted-foreground/60">Secured by Clerk</p>
    </AuthScreen>
  );
}

/** No Clerk keys on this deployment — say so rather than showing a dead form. */
function NotConfigured() {
  return (
    <AuthScreen title="Signup is not set up here" subtitle="This server has no Clerk keys configured.">
      <div className="flex items-start gap-3 rounded-2xl border-2 border-border bg-card p-4 text-sm text-muted-foreground">
        <AlertCircle size={18} className="mt-0.5 shrink-0" />
        <p>Existing accounts can still sign in with their email and password.</p>
      </div>
      <Button variant="chunky" size="cta" onClick={() => (window.location.href = '/login')}>
        Go to sign in
      </Button>
    </AuthScreen>
  );
}

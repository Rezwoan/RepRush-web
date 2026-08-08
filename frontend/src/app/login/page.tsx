'use client';
/**
 * The one sign-in page.
 *
 * There used to be two — `/login` and Clerk's `/sign-in` — and then one that
 * was Clerk's `<SignIn>` component wearing our colours. This is a **custom
 * Clerk flow**: our markup, our buttons, Clerk's credentials (see
 * `components/auth/auth-ui.tsx` for why the component had to go).
 *
 * Three things share the page, in this order:
 *
 *  1. **Google and Facebook** — both enabled on the instance, both leading the
 *     screen. A tap on a provider you are already signed into beats recalling
 *     a password, and this is the screen people bounce off.
 *  2. **Email and password**, behind a text link. Tried against Clerk first,
 *     then against this
 *     app's own database — every account that existed before 2026-08-08 has
 *     its hash *here*, not in Clerk, and those people cannot sign in through
 *     Clerk's password field. One form, either credential: "my old password
 *     doesn't work" was the failure this had to end.
 *  3. **Forgot password**, which is Clerk's email-code reset inline rather than
 *     a hand-off to a hosted page in another skin.
 *
 * Either route lands on the same account: the backend matches a verified Clerk
 * email against the existing row (`AuthService.loginWithClerk`).
 *
 * `?token=` still activates an invited v1 account, and `?next=` still decides
 * where a protected link resumes.
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSignIn } from '@clerk/nextjs';
import { useAuth } from '@/lib/auth-context';
import { authApi } from '@/lib/api';
import { setToken } from '@/lib/token';
import { Button } from '@/components/ui/button';
import { clerkEnabled } from '@/components/auth/clerk-gate';
import {
  AuthError,
  AuthScreen,
  CodeInput,
  Divider,
  SocialButtons,
  authField,
  clerkError,
} from '@/components/auth/auth-ui';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const params = useSearchParams();
  const inviteToken = params.get('token');
  // An invite link is a different job — set a password, then in.
  if (inviteToken) return <Activate token={inviteToken} />;
  return clerkEnabled ? <ClerkSignIn /> : <PasswordOnly />;
}

/** Where to land after signing in — `?next=` wins, then role, then home. */
function useLanding() {
  const params = useSearchParams();
  const next = params.get('next');
  return (role?: string) => next || (role === 'admin' ? '/admin' : '/home');
}

function ClerkSignIn() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const landing = useLanding();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [phase, setPhase] = useState<'form' | 'reset-sent'>('form');
  const [busy, setBusy] = useState(false);
  // `?error=clerk` is `ClerkBridge` bailing out of a handshake it could not
  // finish, rather than something the user did on this page.
  const [error, setError] = useState(
    params.get('error') === 'clerk' ? "We couldn't finish signing you in. Try again." : '',
  );

  useEffect(() => {
    if (!loading && user) router.replace(landing(user.role));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const submit = async () => {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await signIn.create({ identifier: email.trim(), password });
      if (res.status === 'complete') {
        await setActive({ session: res.createdSessionId });
        return; // ClerkBridge exchanges the session; the effect above routes.
      }
      setError('This account needs another step to sign in. Try Google, or reset your password.');
    } catch (err) {
      // Clerk does not know this identity — but this app might. Every pre-Clerk
      // account's password lives in our database, and its owner has no way to
      // tell the two apart, so the same form has to try both.
      try {
        const legacy = await login(email.trim(), password);
        router.replace(landing(legacy.role));
        return;
      } catch (legacyErr: any) {
        setError(legacyErr?.response?.data?.message || clerkError(err, 'Check your email and password.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const social = async (strategy: 'oauth_google' | 'oauth_facebook') => {
    if (!isLoaded) return;
    setError('');
    try {
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: landing(),
      });
    } catch (err) {
      setError(clerkError(err));
    }
  };

  const sendReset = async () => {
    if (!isLoaded || busy) return;
    if (!email.includes('@')) {
      setError('Enter your email address first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signIn.create({ strategy: 'reset_password_email_code', identifier: email.trim() });
      setPhase('reset-sent');
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  };

  const finishReset = async () => {
    if (!isLoaded || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password: newPassword,
      });
      if (res.status !== 'complete') {
        setError('That did not complete the reset. Try again.');
        return;
      }
      await setActive({ session: res.createdSessionId });
    } catch (err) {
      setError(clerkError(err, 'That code is wrong or has expired.'));
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'reset-sent')
    return (
      <AuthScreen
        title="Set a new password"
        subtitle={
          <>
            We sent a six-digit code to <span className="font-semibold text-foreground">{email}</span>.
          </>
        }
        footer={
          <button type="button" onClick={() => setPhase('form')} className="font-semibold text-primary hover:underline">
            Back to sign in
          </button>
        }
      >
        <CodeInput value={code} onChange={setCode} />
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && finishReset()}
          placeholder="New password (8+ characters)"
          className={authField}
        />
        <AuthError>{error}</AuthError>
        <Button
          variant="chunky"
          size="cta"
          disabled={busy || code.length < 6 || newPassword.length < 8}
          onClick={finishReset}
        >
          {busy ? 'Saving…' : 'Save and sign in'}
        </Button>
      </AuthScreen>
    );

  return (
    <AuthScreen
      title="Welcome back."
      subtitle="Let's get after it."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <a href="/sign-up" className="font-semibold text-primary hover:underline">
            Get started
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
            Sign in with email instead
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Password"
            className={authField}
          />
          <AuthError>{error}</AuthError>
          <Button
            variant="chunkyOutline"
            size="cta"
            disabled={busy || !email || !password}
            onClick={submit}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <button
            type="button"
            onClick={sendReset}
            className="w-full pt-1 text-center text-xs font-semibold text-primary hover:underline"
          >
            Forgot your password?
          </button>
        </>
      )}
      <p className="pt-1 text-center text-[10px] text-muted-foreground/60">Secured by Clerk</p>
    </AuthScreen>
  );
}

/** No Clerk on this deployment: the app's own password login, alone. */
function PasswordOnly() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const landing = useLanding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && user) router.replace(landing(user.role));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const me = await login(email.trim(), password);
      router.replace(landing(me.role));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Login failed. Check your credentials.');
      setBusy(false);
    }
  };

  return (
    <AuthScreen title="Welcome back." subtitle="Let's get after it.">
      <input
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className={authField}
      />
      <input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Password"
        className={authField}
      />
      <AuthError>{error}</AuthError>
      <Button variant="chunky" size="cta" disabled={busy || !email || !password} onClick={submit}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </AuthScreen>
  );
}

/** v1's invite flow: `?token=` sets the first password on an invited account. */
function Activate({ token }: { token: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get('next');
  const email = params.get('email');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (password !== confirm) return setError('Passwords do not match');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    setBusy(true);
    setError('');
    try {
      const res = await authApi.activate(token, password);
      if (res.data.token) setToken(res.data.token);
      router.replace(next || '/home');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Activation failed. The link may have expired.');
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      title="Create your password"
      subtitle={email ? decodeURIComponent(email) : 'Set up your account to get started.'}
    >
      <input
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password (8+ characters)"
        className={authField}
      />
      <input
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Repeat password"
        className={authField}
      />
      <AuthError>{error}</AuthError>
      <Button variant="chunky" size="cta" disabled={busy} onClick={submit}>
        {busy ? 'Activating…' : 'Activate and continue'}
      </Button>
    </AuthScreen>
  );
}

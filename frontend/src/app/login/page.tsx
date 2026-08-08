'use client';
/**
 * The one sign-in page.
 *
 * There used to be two — `/login` (email + password) and `/sign-in` (Clerk,
 * which *also* shows email and password) — because Clerk was added beside the
 * old form instead of replacing it. Two doors, near-identical fields, and no
 * way for anyone to know which one was theirs. `/sign-in` now redirects here.
 *
 * The order on this page is the whole design:
 *   1. Clerk — Google, or an email code, or a Clerk password. The default.
 *   2. A disclosure for the legacy password, because every account that existed
 *      before 2026-08-08 has its hash in *our* database, not Clerk's, and those
 *      people cannot sign in through Clerk's password field. It is not a second
 *      front door; it is the answer to "my old password doesn't work".
 *
 * Either route lands on the same account: the backend matches a verified Clerk
 * email against the existing row (`AuthService.loginWithClerk`).
 */
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SignIn } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { authApi } from '@/lib/api';
import { setToken } from '@/lib/token';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';
import { clerkEnabled } from '@/components/auth/clerk-gate';
import { useClerkAppearance } from '@/components/auth/clerk-appearance';

function LoginContent() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const appearance = useClerkAppearance();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /** Where to land after signing in — set by any link that needs a session. */
  const next = params.get('next');
  const landing = (role?: string) => next || (role === 'admin' ? '/admin' : '/home');
  const inviteToken = params.get('token');
  const inviteEmail = params.get('email');
  const isActivation = Boolean(inviteToken);

  useEffect(() => {
    if (!loading && user) router.replace(landing(user.role));
    if (inviteEmail) setEmail(decodeURIComponent(inviteEmail));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, inviteEmail, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const loggedInUser = await login(email, password);
      router.replace(landing(loggedInUser.role));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Login failed. Check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await authApi.activate(inviteToken!, newPassword);
      if (res.data.token) setToken(res.data.token);
      router.replace(next || '/home');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Activation failed. Link may have expired.');
    } finally {
      setSubmitting(false);
    }
  };

  const errorBanner = (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          className="flex items-center gap-2 overflow-hidden rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircle size={15} className="flex-shrink-0" />
          {error}
        </motion.div>
      )}
    </AnimatePresence>
  );

  const legacyForm = (
    <form onSubmit={handleLogin} className="space-y-4">
      <Field label="Email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required className="field" />
      </Field>
      <Field label="Password">
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required className="field" />
      </Field>
      <Button type="submit" disabled={submitting} className="w-full" size="lg">
        {submitting ? 'Signing in…' : <>Sign in <ArrowRight size={16} /></>}
      </Button>
    </form>
  );

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden p-4">
      <div className="absolute inset-0 bg-grid opacity-[0.4]" />
      <motion.div
        aria-hidden
        className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-[120px]"
        animate={{ opacity: [0.5, 0.85, 0.5], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
        className="relative w-full max-w-sm"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size="lg" withText={false} />
          <h1 className="mt-4 text-3xl font-display font-extrabold tracking-tight">
            Rep<span className="text-gradient">Rush</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isActivation ? 'Set up your account to get started' : "Welcome back. Let's get after it."}
          </p>
        </div>

        <div className="glass rounded-2xl p-6 shadow-lift">
          {isActivation ? (
            <>
              <h2 className="mb-5 text-lg font-display font-semibold">Create your password</h2>
              {errorBanner}
              <form onSubmit={handleActivate} className="space-y-4">
                <Field label="Email">
                  <input type="email" value={email} disabled className="field cursor-not-allowed opacity-60" />
                </Field>
                <Field label="New Password">
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters" required className="field" />
                </Field>
                <Field label="Confirm Password">
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" required className="field" />
                </Field>
                <Button type="submit" disabled={submitting} className="w-full" size="lg">
                  {submitting ? 'Activating…' : <>Activate &amp; Continue <ArrowRight size={16} /></>}
                </Button>
              </form>
            </>
          ) : clerkEnabled ? (
            <>
              {errorBanner}
              {/* `routing="hash"` keeps every Clerk sub-step (SSO callback, second
                  factor, reset) on this one URL. The alternative is a catch-all
                  route, which is what produced a second sign-in page in the
                  first place. */}
              <SignIn
                routing="hash"
                appearance={appearance}
                signUpUrl="/welcome"
                forceRedirectUrl={landing()}
                fallbackRedirectUrl={landing()}
              />

              <p className="mt-4 text-center text-[10px] text-muted-foreground/60">
                Secured by Clerk
              </p>

            </>
          ) : (
            <>
              <h2 className="mb-5 text-lg font-display font-semibold">Sign in</h2>
              {errorBanner}
              {legacyForm}
            </>
          )}
        </div>

        {!isActivation && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{' '}
            <a href="/welcome" className="font-semibold text-primary hover:underline">
              Get started
            </a>
          </p>
        )}
      </motion.div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

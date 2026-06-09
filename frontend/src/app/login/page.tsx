'use client';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { authApi } from '@/lib/api';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

function LoginContent() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const inviteToken = params.get('token');
  const inviteEmail = params.get('email');
  const isActivation = Boolean(inviteToken);

  useEffect(() => {
    if (!loading && user) router.replace(user.role === 'admin' ? '/admin' : '/dashboard');
    if (inviteEmail) setEmail(decodeURIComponent(inviteEmail));
  }, [user, loading, inviteEmail, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const loggedInUser = await login(email, password);
      router.replace(loggedInUser.role === 'admin' ? '/admin' : '/dashboard');
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
      if (typeof window !== 'undefined' && res.data.token) {
        sessionStorage.setItem('reprush_token', res.data.token);
      }
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Activation failed. Link may have expired.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 bg-grid opacity-[0.4]" />
      <motion.div
        aria-hidden
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full bg-brand-500/20 blur-[120px]"
        animate={{ opacity: [0.5, 0.85, 0.5], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-0 right-10 w-72 h-72 rounded-full bg-volt-400/10 blur-[100px]"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
        className="relative w-full max-w-sm"
      >
        <div className="text-center mb-8 flex flex-col items-center">
          <Logo size="lg" withText={false} />
          <h1 className="mt-4 text-3xl font-display font-extrabold tracking-tight">
            Rep<span className="text-gradient">Rush</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            {isActivation ? 'Set up your account to get started' : "Welcome back. Let's get after it."}
          </p>
        </div>

        <div className="glass rounded-2xl p-6 shadow-lift">
          <h2 className="text-lg font-display font-semibold mb-5">
            {isActivation ? 'Create your password' : 'Sign in'}
          </h2>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl px-3 py-2.5 overflow-hidden"
              >
                <AlertCircle size={15} className="flex-shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {isActivation ? (
            <form onSubmit={handleActivate} className="space-y-4">
              <Field label="Email">
                <input type="email" value={email} disabled className="field opacity-60 cursor-not-allowed" />
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
          ) : (
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
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Don&apos;t have an account? Contact your admin.
        </p>
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-muted-foreground block mb-1.5">{label}</span>
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

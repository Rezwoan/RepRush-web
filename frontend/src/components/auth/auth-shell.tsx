'use client';

import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { spring } from '@/lib/motion';

/**
 * The frame around Clerk's `<SignIn>` / `<SignUp>` — the same ambient background,
 * logo lockup and entrance the `/login` screen has, so arriving at a Clerk page
 * does not feel like being handed off to another product.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-[0.4]" />
      <motion.div
        aria-hidden
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full bg-brand-500/20 blur-[120px]"
        animate={{ opacity: [0.5, 0.85, 0.5], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
        className="relative w-full max-w-sm"
      >
        <div className="text-center mb-7 flex flex-col items-center">
          <Logo size="lg" withText={false} />
          <h1 className="mt-4 text-3xl font-display font-extrabold tracking-tight">
            Rep<span className="text-gradient">Rush</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-2 font-semibold">{title}</p>
          <p className="text-muted-foreground/80 text-xs mt-1.5 max-w-[19rem] leading-relaxed">{subtitle}</p>
        </div>

        <div className="flex justify-center">{children}</div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Prefer your password?{' '}
          <a href="/login" className="font-semibold text-primary hover:underline">
            Sign in the old way
          </a>
        </p>
      </motion.div>
    </main>
  );
}

/**
 * Shown when someone reaches `/sign-up` on a deployment with no Clerk keys.
 *
 * A blank screen here would read as a broken app; this says what is true and
 * points at the door that does work.
 */
export function ClerkNotConfigured() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="glass rounded-2xl p-6 max-w-sm text-center">
        <AlertCircle className="mx-auto mb-3 text-muted-foreground" size={22} />
        <h1 className="font-display font-semibold mb-1.5">Sign-in is not set up here</h1>
        <p className="text-sm text-muted-foreground mb-4">
          This server has no Clerk keys configured. Your email and password still work.
        </p>
        <a
          href="/login"
          className="inline-block font-semibold text-primary hover:underline text-sm"
        >
          Continue to sign in →
        </a>
      </div>
    </main>
  );
}

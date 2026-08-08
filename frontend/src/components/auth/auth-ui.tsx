'use client';
/**
 * The shared furniture for `/sign-up` and `/login`.
 *
 * Both pages are **custom Clerk flows** (`useSignUp` / `useSignIn`) rather than
 * Clerk's drop-in `<SignUp>` / `<SignIn>` components. Four separate commits went
 * into overriding those components' CSS — hiding a footer band, un-gridding the
 * social buttons, re-colouring text that rendered dark-on-dark — and the result
 * still read as another product's form dropped into ours: a two-up button grid
 * squeezed to ~130px a side on a phone, next to the funnel's full-width chunky
 * keys. Owning the markup ends that argument: the same `Button`, the same
 * rounded-2xl border-2 fields and the same type scale as every other screen,
 * and no first/last-name fields we never wanted.
 *
 * Clerk still owns the credential, the verification email and the OAuth
 * handshake. Only the pixels moved.
 */
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** Same geometry as the funnel's inputs, so signup and step 2 look related. */
export const authField =
  'w-full rounded-2xl border-2 border-border bg-card px-4 py-4 font-semibold outline-none ' +
  'transition-colors placeholder:font-medium placeholder:text-muted-foreground/70 focus:border-primary';

export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 py-10">
      <div aria-hidden className="absolute inset-0 bg-grid opacity-[0.4]" />
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
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" withText={false} />
          <h1 className="mt-5 text-[28px] font-extrabold leading-tight">{title}</h1>
          {subtitle && (
            <p className="mt-2 max-w-[20rem] text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {/* Everything stacks full width. Two buttons side by side on a 390px
            phone is where the cramped look came from. */}
        <div className="space-y-3">{children}</div>

        {footer && <div className="mt-7 text-center text-xs text-muted-foreground">{footer}</div>}
      </motion.div>
    </main>
  );
}

/** The one place an error from either flow is shown. */
export function AuthError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive">
      {children}
    </p>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** A six-digit code from Clerk's email — used by signup and by password reset. */
export function CodeInput({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
}) {
  return (
    <input
      autoFocus
      inputMode="numeric"
      autoComplete="one-time-code"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      placeholder="······"
      aria-label="Verification code"
      className={cn(authField, 'nums text-center text-2xl font-extrabold tracking-[0.4em]')}
    />
  );
}

/**
 * The two doors that come first.
 *
 * Both are enabled on the Clerk instance (checked against `/v1/environment`,
 * not assumed), and they lead the page rather than sitting under an email form:
 * a tap on a provider you are already signed into beats choosing a password,
 * remembering it, and finding the verification email. Full width, stacked — the
 * two-up grid this replaced gave each button about 130px on a phone.
 */
export function SocialButtons({
  onPick,
  disabled,
}: {
  onPick: (strategy: 'oauth_google' | 'oauth_facebook') => void;
  disabled?: boolean;
}) {
  return (
    <>
      <Button
        variant="chunkyLight"
        size="cta"
        disabled={disabled}
        onClick={() => onPick('oauth_google')}
      >
        <GoogleIcon /> Continue with Google
      </Button>
      <Button
        variant="chunky"
        size="cta"
        disabled={disabled}
        className="border-b-black/30 bg-[#1877F2] text-white"
        onClick={() => onPick('oauth_facebook')}
      >
        <FacebookIcon /> Continue with Facebook
      </Button>
    </>
  );
}

/**
 * The bare "f", white on the button's blue — not the f-in-a-circle mark.
 *
 * The circle version is one path whose counter only reads as a hole under
 * `evenodd`; filled the ordinary way it renders as a solid blob, which is
 * exactly what shipped for one deploy.
 */
export function FacebookIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size * 0.625} height={size} viewBox="0 0 320 512" fill="currentColor" aria-hidden>
      <path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z" />
    </svg>
  );
}

export function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.7l7.8 6c1.9-5.6 7.2-10.2 13.6-10.2z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.3z" />
      <path fill="#FBBC05" d="M10.4 28.3a14.5 14.5 0 0 1 0-8.6l-7.8-6a24 24 0 0 0 0 20.6l7.8-6z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2 15.4-5.6l-7.5-5.8c-2.1 1.4-4.8 2.2-7.9 2.2-6.4 0-11.7-4.5-13.6-10.2l-7.8 6C6.5 42.1 14.6 47.5 24 47.5z" />
    </svg>
  );
}

/**
 * Clerk's errors arrive as `err.errors[0]`, and its `longMessage` is the one
 * written for a human ("Password must contain…"), not the code.
 */
export function clerkError(err: unknown, fallback = 'Something went wrong. Try again.') {
  const first = (err as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0];
  return first?.longMessage || first?.message || fallback;
}

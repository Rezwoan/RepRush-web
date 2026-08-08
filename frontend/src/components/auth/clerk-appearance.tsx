import type { Appearance } from '@clerk/types';

/**
 * Paint Clerk's components with this app's own tokens instead of Clerk's
 * defaults.
 *
 * Everything here resolves to a CSS variable rather than a literal colour,
 * because the theme is chosen at runtime — 34 of them, plus light and dark, set
 * by the pre-paint boot script in the root layout. Hard-coding even the brand
 * blue would leave the sign-in card stuck in one theme while the page around it
 * changed, which looks like a bug in whichever theme you are actually using.
 *
 * `--primary-fill` rather than `--primary` on the button is deliberate and is
 * the same rule the rest of the app follows: white on the brand cobalt is
 * 3.87:1 and AA wants 4.5, so the fill is a separately derived token
 * (`lib/themes.ts`).
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: 'hsl(var(--primary-fill))',
    colorText: 'hsl(var(--foreground))',
    colorTextSecondary: 'hsl(var(--muted-foreground))',
    colorBackground: 'hsl(var(--card))',
    colorInputBackground: 'hsl(var(--background))',
    colorInputText: 'hsl(var(--foreground))',
    colorDanger: 'hsl(var(--destructive))',
    borderRadius: '0.85rem',
    fontFamily: 'var(--font-inter)',
  },
  elements: {
    // The page already carries the logo lockup and the headline.
    header: 'hidden',
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none',
    card: 'bg-transparent shadow-none border-0 p-0',
    footer: 'bg-transparent',
    formButtonPrimary:
      'font-semibold tracking-tight normal-case text-[0.95rem] shadow-lift',
    socialButtonsBlockButton:
      'border border-border bg-background/60 hover:bg-background transition-colors',
    dividerLine: 'bg-border',
    formFieldInput: 'border border-border',
  },
};

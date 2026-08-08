'use client';

import { useEffect, useState } from 'react';
import type { Appearance } from '@clerk/types';

/**
 * Clerk's appearance, painted with this app's live theme.
 *
 * **Clerk's `variables` need real colour values, not `var()` references.** It
 * parses each colour to derive a whole scale from it (hover, active, borders,
 * alpha overlays), and a `var(--primary)` string is not parseable — so the first
 * version of this file silently got Clerk's *defaults*, which are built for a
 * light background. On our dark card that rendered the Google and Facebook
 * buttons as dark-grey text on a dark surface: present, clickable, and to the
 * eye simply not there.
 *
 * So the values are *resolved* from the document at runtime. That also keeps
 * Clerk in step with the theme picker — 34 themes plus light and dark, chosen
 * client-side after paint, which is exactly why they cannot be baked in.
 */

/** `--foreground: 210 30% 96%` → `hsl(210 30% 96%)`. */
function readHsl(styles: CSSStyleDeclaration, name: string, fallback: string) {
  const raw = styles.getPropertyValue(name).trim();
  return raw ? `hsl(${raw})` : fallback;
}

export function useClerkAppearance(): Appearance {
  const [vars, setVars] = useState<Appearance['variables']>();

  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.documentElement);
      setVars({
        colorPrimary: readHsl(s, '--primary-fill', '#0a80f5'),
        colorText: readHsl(s, '--foreground', '#e8edf3'),
        colorTextSecondary: readHsl(s, '--muted-foreground', '#8a97a8'),
        colorBackground: readHsl(s, '--card', '#11151e'),
        colorInputBackground: readHsl(s, '--background', '#0b0f17'),
        colorInputText: readHsl(s, '--foreground', '#e8edf3'),
        colorDanger: readHsl(s, '--destructive', '#e5484d'),
        colorNeutral: readHsl(s, '--foreground', '#e8edf3'),
        borderRadius: '0.85rem',
        fontFamily: 'var(--font-inter)',
      });
    };
    read();

    // The theme is swapped by writing `data-theme` on <html>, so re-read when it
    // does — otherwise the sign-in card keeps the palette it mounted with.
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => obs.disconnect();
  }, []);

  return {
    variables: vars,
    elements: {
      // The page already carries the logo lockup and the headline.
      header: 'hidden',
      rootBox: 'w-full',
      cardBox: 'w-full shadow-none',
      card: 'bg-transparent shadow-none border-0 p-0',
      // Hidden: the page carries its own "Don't have an account? Get started",
      // which points at the onboarding funnel. Clerk's footer offers a second
      // signup link to a different place, so both on screen is one prompt too
      // many and two answers to the same question.
      footerAction: 'hidden',
      footer: 'bg-transparent',
      formButtonPrimary: 'font-semibold tracking-tight normal-case text-[0.95rem] h-12 shadow-lift',
      // Explicit foreground: this is the element that was invisible, and it is
      // the one place Clerk's own default text colour used to win.
      socialButtonsBlockButton:
        'border-2 border-border bg-secondary/60 text-foreground hover:bg-secondary h-12 font-semibold normal-case transition-colors',
      socialButtonsBlockButtonText: 'text-foreground font-semibold',
      dividerLine: 'bg-border',
      dividerText: 'text-muted-foreground',
      formFieldLabel: 'text-muted-foreground font-semibold',
      formFieldInput: 'border-2 border-border bg-card h-12',
      footerActionText: 'text-muted-foreground',
      footerActionLink: 'text-primary font-semibold hover:underline',
    },
  };
}

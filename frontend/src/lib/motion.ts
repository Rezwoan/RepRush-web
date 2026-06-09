import type { Transition, Variants } from 'framer-motion';

/**
 * Shared motion language for RepRush.
 * Everything physical (springs) so interactions feel weighty and alive,
 * not linear/robotic. Tuned to read as "fast but settled".
 */

export const spring = {
  /** quick UI feedback — taps, toggles, small reveals */
  snappy: { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 } as Transition,
  /** default for cards / content entering */
  soft: { type: 'spring', stiffness: 260, damping: 28, mass: 0.9 } as Transition,
  /** playful overshoot — celebratory moments, numbers landing */
  bouncy: { type: 'spring', stiffness: 480, damping: 20, mass: 0.8 } as Transition,
  /** slow, heavy — large surfaces, page chrome */
  gentle: { type: 'spring', stiffness: 150, damping: 24, mass: 1 } as Transition,
} as const;

export const ease = {
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
};

// ── Reusable variants ───────────────────────────────────────────────

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: spring.soft },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35, ease: ease.out } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: spring.snappy },
};

export const slideDown: Variants = {
  hidden: { opacity: 0, y: -14 },
  show: { opacity: 1, y: 0, transition: spring.soft },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -22 },
  show: { opacity: 1, x: 0, transition: spring.soft },
};

/** Parent that staggers its direct motion children. */
export const stagger = (gap = 0.06, delay = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

export const staggerContainer: Variants = stagger();

/** Page-level enter — pairs with the PageTransition wrapper. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { ...spring.gentle, when: 'beforeChildren', staggerChildren: 0.055 },
  },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2, ease: ease.inOut } },
};

/** Tap / hover presets for interactive press feedback. */
export const press = {
  whileTap: { scale: 0.95 },
  whileHover: { scale: 1.02 },
  transition: spring.snappy,
};

export const pressSubtle = {
  whileTap: { scale: 0.97 },
  transition: spring.snappy,
};

'use client';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { pageVariants, fadeUp, staggerContainer } from '@/lib/motion';

/** Wrap a page's content. Fades/lifts in and orchestrates child stagger. */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

/** A container that staggers its motion children when scrolled into view. */
export function Stagger({
  children,
  className,
  inView,
  ...props
}: HTMLMotionProps<'div'> & { inView?: boolean }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      {...(inView
        ? { whileInView: 'show', viewport: { once: true, margin: '-8% 0px' } }
        : { animate: 'show' })}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** A single child that fades/lifts up. Use inside <Stagger> or standalone (scroll-reveal). */
export function Item({
  children,
  className,
  standalone,
  ...props
}: HTMLMotionProps<'div'> & { standalone?: boolean }) {
  return (
    <motion.div
      variants={fadeUp}
      {...(standalone
        ? { initial: 'hidden', whileInView: 'show', viewport: { once: true, margin: '-8% 0px' } }
        : {})}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Brand splash loader used on auth/boot screens. */
export function BrandLoader({ label = 'RepRush' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-5">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="relative"
      >
        <motion.div
          className="absolute inset-0 rounded-2xl bg-brand-500/30 blur-xl"
          animate={{ opacity: [0.3, 0.7, 0.3], scale: [0.9, 1.1, 0.9] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <img src="/icon.png" alt="" className="relative w-16 h-16 rounded-2xl" />
      </motion.div>
      <div className="flex items-center gap-3">
        <span className="loader-ring !w-5 !h-5 !border-2" />
        <p className={cn('text-xs text-muted-foreground tracking-[0.3em] uppercase')}>{label}</p>
      </div>
    </div>
  );
}

'use client';
import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { spring, fadeUp } from '@/lib/motion';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  /** lift + glow on hover */
  interactive?: boolean;
  /** participate in a parent stagger (uses fadeUp variants) */
  reveal?: boolean;
  glow?: 'brand' | 'volt' | 'none';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, reveal, glow = 'none', children, ...props }, ref) => (
    <motion.div
      ref={ref}
      variants={reveal ? fadeUp : undefined}
      whileHover={
        interactive
          ? { y: -4, transition: spring.snappy }
          : undefined
      }
      className={cn(
        'relative rounded-2xl border border-border bg-card shadow-card overflow-hidden',
        glow === 'brand' && 'shadow-glow-brand',
        glow === 'volt' && 'shadow-glow-volt',
        interactive && 'cursor-pointer hover:border-brand-500/40 transition-colors',
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  ),
);
Card.displayName = 'Card';

export function CardHeader({
  title,
  icon,
  action,
  accent = 'brand',
  className,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  accent?: 'brand' | 'volt' | 'muted';
  className?: string;
}) {
  const accentColor =
    accent === 'volt' ? 'text-volt-400' : accent === 'muted' ? 'text-muted-foreground' : 'text-brand-400';
  return (
    <div className={cn('flex items-center justify-between gap-3 mb-4', className)}>
      <h2 className="font-semibold text-foreground flex items-center gap-2">
        {icon && <span className={accentColor}>{icon}</span>}
        {title}
      </h2>
      {action}
    </div>
  );
}

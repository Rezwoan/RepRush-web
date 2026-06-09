'use client';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  withText?: boolean;
  animated?: boolean;
  className?: string;
}

const dims = {
  sm: { box: 'w-9 h-9 rounded-xl', text: 'text-lg' },
  md: { box: 'w-11 h-11 rounded-2xl', text: 'text-2xl' },
  lg: { box: 'w-16 h-16 rounded-2xl', text: 'text-3xl' },
};

export function Logo({ size = 'md', withText = true, animated = true, className }: Props) {
  const d = dims[size];
  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <motion.div
        className={cn('relative flex-shrink-0 overflow-hidden bg-white/95 shadow-glow-brand', d.box)}
        {...(animated
          ? {
              initial: { scale: 0.85, rotate: -6, opacity: 0 },
              animate: { scale: 1, rotate: 0, opacity: 1 },
              transition: { type: 'spring', stiffness: 320, damping: 18 },
              whileHover: { scale: 1.06, rotate: -2 },
            }
          : {})}
      >
        <img src="/icon.png" alt="RepRush" className="w-full h-full object-contain p-0.5" />
      </motion.div>
      {withText && (
        <span className={cn('font-display font-extrabold tracking-tight text-foreground', d.text)}>
          Rep<span className="text-gradient">Rush</span>
        </span>
      )}
    </div>
  );
}

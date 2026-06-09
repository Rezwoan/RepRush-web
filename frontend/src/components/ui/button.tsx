'use client';
import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';

export const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold ' +
    'transition-colors select-none disabled:pointer-events-none disabled:opacity-50 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        brand:
          'bg-brand-gradient text-white shadow-glow-brand hover:brightness-110',
        volt:
          'bg-volt-gradient text-volt-900 shadow-glow-volt hover:brightness-105',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-elevated border border-border',
        ghost:
          'text-muted-foreground hover:text-foreground hover:bg-secondary/70',
        outline:
          'border border-brand-500/40 text-brand-300 hover:bg-brand-500/10',
        danger:
          'bg-destructive text-destructive-foreground hover:brightness-110',
      },
      size: {
        sm: 'h-9 px-3.5 text-sm',
        md: 'h-11 px-5 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'brand', size: 'md' },
  },
);

export interface ButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'ref'>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, children, disabled, ...props }, ref) => (
    <motion.button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      transition={spring.snappy}
      disabled={disabled}
      {...props}
    >
      {children}
    </motion.button>
  ),
);
Button.displayName = 'Button';

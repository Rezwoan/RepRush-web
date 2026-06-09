'use client';
import { useEffect, useRef } from 'react';
import { motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Props {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/** Count-up that springs into place when scrolled into view. */
export function AnimatedNumber({ value, decimals = 0, prefix = '', suffix = '', className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-8% 0px' });
  const mv = useMotionValue(0);
  const sp = useSpring(mv, { stiffness: 90, damping: 22, mass: 1 });
  const text = useTransform(sp, (v) => `${prefix}${v.toFixed(decimals)}${suffix}`);

  useEffect(() => {
    if (inView) mv.set(value);
  }, [inView, value, mv]);

  return <motion.span ref={ref} className={cn('nums', className)}>{text}</motion.span>;
}

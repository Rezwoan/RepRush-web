'use client';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fadeUp, spring } from '@/lib/motion';

interface Props {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: 'brand' | 'volt' | 'success' | 'destructive';
  hint?: string;
  className?: string;
}

const accents = {
  brand: { text: 'text-brand-400', bg: 'bg-brand-500/12', ring: 'group-hover:border-brand-500/40' },
  volt: { text: 'text-volt-400', bg: 'bg-volt-400/12', ring: 'group-hover:border-volt-400/40' },
  success: { text: 'text-success', bg: 'bg-success/12', ring: 'group-hover:border-success/40' },
  destructive: { text: 'text-destructive', bg: 'bg-destructive/12', ring: 'group-hover:border-destructive/40' },
};

export function StatCard({ icon, label, value, accent = 'brand', hint, className }: Props) {
  const a = accents[accent];
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -4, transition: spring.snappy }}
      className={cn(
        'group relative rounded-2xl border border-border bg-card p-4 shadow-card overflow-hidden transition-colors',
        a.ring,
        className,
      )}
    >
      <div
        className={cn(
          'inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3',
          a.bg,
          a.text,
        )}
      >
        {icon}
      </div>
      <div className="text-2xl font-display font-bold text-foreground leading-none nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-1.5">{label}</div>
      {hint && <div className={cn('text-[11px] mt-1 font-medium', a.text)}>{hint}</div>}
    </motion.div>
  );
}

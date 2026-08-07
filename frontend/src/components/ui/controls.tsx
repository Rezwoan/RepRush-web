'use client';
/** Small stateless controls: segmented tabs, filter chips, switches, option cards. */
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';

// ── Segmented control ───────────────────────────────────────────────
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const uid = useId();
  return (
    <div
      role="tablist"
      className={cn('flex gap-1 rounded-2xl bg-secondary p-1', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex-1 rounded-xl font-semibold transition-colors',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active && (
              <motion.span
                layoutId={`${uid}-seg`}
                transition={spring.snappy}
                className="absolute inset-0 rounded-xl bg-primary"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Underline tabs (For You / Friends / Discovery) ──────────────────
export function TabBarLinks<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const uid = useId();
  // Past four, equal thirds stop fitting a phone: scroll instead of shrinking
  // the type until it is unreadable. The Ranks tab has six.
  const scroll = options.length > 4;
  return (
    <div
      role="tablist"
      className={cn(
        'flex border-b border-border',
        scroll && 'no-scrollbar -mx-4 gap-1 overflow-x-auto px-4',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative pb-3 pt-2 font-bold transition-colors',
              scroll ? 'shrink-0 px-2.5 text-base' : 'flex-1 text-lg',
              active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
            {active && (
              <motion.span
                layoutId={`${uid}-underline`}
                transition={spring.snappy}
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Filter chip ─────────────────────────────────────────────────────
export function Chip({
  children,
  active,
  onClick,
  className,
  as = 'button',
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  as?: 'button' | 'span';
}) {
  const Cmp = as as 'button';
  return (
    <Cmp
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5',
        'text-sm font-semibold transition-colors',
        active
          ? 'border-primary/50 bg-primary/15 text-primary'
          : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
        onClick && 'press',
        className,
      )}
    >
      {children}
    </Cmp>
  );
}

// ── Switch ──────────────────────────────────────────────────────────
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
        className,
      )}
    >
      <motion.span
        layout
        transition={spring.snappy}
        className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
        style={{ left: checked ? 26 : 4 }}
      />
    </button>
  );
}

// ── Option card (the onboarding answer) ─────────────────────────────
export function OptionCard({
  label,
  sublabel,
  icon,
  selected,
  onClick,
  multi,
  className,
}: {
  label: React.ReactNode;
  sublabel?: React.ReactNode;
  icon?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  /** Multi-select shows a checkbox affordance instead of a border-only state. */
  multi?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'press flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40',
        className,
      )}
    >
      {icon && <span className={cn('shrink-0', selected ? 'text-primary' : '')}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className={cn('block font-bold', selected ? 'text-primary' : 'text-foreground')}>
          {label}
        </span>
        {sublabel && <span className="mt-0.5 block text-sm text-muted-foreground">{sublabel}</span>}
      </span>
      {multi && (
        <span
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
          )}
        >
          {selected && <Check size={14} strokeWidth={3} />}
        </span>
      )}
    </button>
  );
}

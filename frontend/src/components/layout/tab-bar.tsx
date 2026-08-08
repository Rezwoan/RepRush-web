'use client';
/**
 * The five-tab bottom navigation. Order is deliberate: Workout sits first
 * (left thumb) and Home second, so the two things opened most often are the
 * easiest to reach, with Profile parked at the far edge.
 *
 * There is no Nutrition tab. RepRush does not do food, calories or macros —
 * see MEMORY.md → Decisions. Do not add one back.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Dumbbell, Home, Hexagon, Users, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';

export const TABS = [
  { href: '/workout', label: 'Workout', icon: Dumbbell, tint: 'text-primary' },
  { href: '/home', label: 'Home', icon: Home, tint: 'text-primary' },
  { href: '/ranks', label: 'Ranks', icon: Hexagon, tint: 'text-tier-gold' },
  { href: '/friends', label: 'Friends', icon: Users, tint: 'text-primary' },
  { href: '/profile', label: 'Profile', icon: User, tint: 'text-tier-diamond' },
] as const;

export type TabHref = (typeof TABS)[number]['href'];

export function TabBar({ className }: { className?: string }) {
  const pathname = usePathname() ?? '';

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 border-t border-border bg-popover/90 backdrop-blur-xl safe-bottom',
        className,
      )}
    >
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className="relative flex flex-col items-center gap-1 pb-1.5 pt-2.5"
              >
                {active && (
                  <>
                    <motion.span
                      layoutId="tab-panel"
                      transition={spring.snappy}
                      className="absolute inset-x-0 inset-y-0 -z-10 bg-primary/10"
                    />
                    <motion.span
                      layoutId="tab-rule"
                      transition={spring.snappy}
                      className="absolute inset-x-0 top-0 h-0.5 bg-primary"
                    />
                  </>
                )}
                <motion.span
                  animate={{ scale: active ? 1.12 : 1, y: active ? -1 : 0 }}
                  transition={spring.snappy}
                  className={active ? t.tint : 'text-muted-foreground'}
                >
                  <Icon size={23} strokeWidth={active ? 2.4 : 2} />
                </motion.span>
                <span
                  className={cn(
                    'text-[10px] font-semibold transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

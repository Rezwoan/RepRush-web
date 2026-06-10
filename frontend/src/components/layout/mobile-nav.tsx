'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { LayoutDashboard, Dumbbell, Trophy, TrendingUp, User, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { spring } from '@/lib/motion';

const navItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/workout', label: 'Workout', icon: Dumbbell },
  { href: '/leaderboard', label: 'Board', icon: Trophy },
  { href: '/achievements', label: 'Progress', icon: TrendingUp },
  { href: '/profile', label: 'Profile', icon: User },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const items =
    user?.role === 'admin'
      ? [{ href: '/admin', label: 'Admin', icon: Shield }]
      : navItems;

  return (
    <motion.nav
      initial={{ y: 80 }}
      animate={{ y: 0 }}
      transition={spring.gentle}
      className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border safe-bottom"
    >
      <div className="flex">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex-1 flex flex-col items-center gap-1 pt-3 pb-2"
            >
              {active && (
                <motion.span
                  layoutId="mobile-active"
                  transition={spring.snappy}
                  className="absolute top-0 h-0.5 w-10 rounded-full bg-volt-gradient shadow-glow-volt"
                />
              )}
              <motion.span
                animate={{ scale: active ? 1.12 : 1, y: active ? -1 : 0 }}
                transition={spring.snappy}
                className={active ? 'text-brand-400' : 'text-muted-foreground'}
              >
                <Icon size={22} />
              </motion.span>
              <span
                className={`text-[10px] font-medium transition-colors ${
                  active ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}

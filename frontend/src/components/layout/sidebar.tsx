'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Dumbbell, Trophy, TrendingUp, User, LogOut, Shield,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getInitials } from '@/lib/utils';
import { Logo } from '@/components/ui/logo';
import { spring } from '@/lib/motion';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/workout', label: 'Workout', icon: Dumbbell },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/achievements', label: 'Progress', icon: TrendingUp },
  { href: '/profile', label: 'Profile', icon: User },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === 'admin';

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const items = isAdmin
    ? [{ href: '/admin', label: 'Admin Panel', icon: Shield }]
    : navItems;

  return (
    <motion.aside
      initial={{ x: -24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={spring.gentle}
      className="w-64 flex flex-col h-full glass border-r border-border"
    >
      <div className="p-5">
        <Link href={isAdmin ? '/admin' : '/dashboard'}>
          <Logo size="sm" />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1">
        {items.map((item, i) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring.soft, delay: 0.05 + i * 0.05 }}
            >
              <Link
                href={item.href}
                className={`relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-xl bg-brand-500/15 border border-brand-500/30"
                  />
                )}
                <Icon
                  size={18}
                  className={`relative z-10 transition-colors ${active ? 'text-brand-400' : ''}`}
                />
                <span className="relative z-10">{item.label}</span>
                {active && (
                  <motion.span
                    layoutId="sidebar-dot"
                    transition={spring.snappy}
                    className="relative z-10 ml-auto w-1.5 h-1.5 rounded-full bg-volt-400 shadow-glow-volt"
                  />
                )}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-9 h-9 rounded-full bg-brand-gradient flex items-center justify-center text-white font-semibold text-sm overflow-hidden flex-shrink-0">
            {user?.profileImage ? (
              <img src={user.profileImage} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              getInitials(user?.name || user?.email || '?')
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <motion.button
            onClick={handleLogout}
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.1 }}
            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Sign out"
          >
            <LogOut size={16} />
          </motion.button>
        </div>
      </div>
    </motion.aside>
  );
}

'use client';
/**
 * The v2 tab shell: global top bar, scrolling content, bottom tab bar.
 *
 * A route group, so it wraps the new tabs without adding a URL segment — and
 * without colliding with v1's routes.
 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { gameApi } from '@/lib/api';
import { STATS_CHANGED } from '@/lib/shell-stats';
import { BrandLoader } from '@/components/ui/motion-primitives';
import { TabBar } from '@/components/layout/tab-bar';
import { TopBar } from '@/components/layout/top-bar';
import OfflineBanner from '@/components/layout/offline-banner';
import ActiveSessionBar from '@/components/workout/active-session-bar';
import { StreakSheet } from '@/components/layout/streak-sheet';
import { UserAvatar } from '@/components/ui/user-avatar';

/**
 * Every tab is a stack of `<h2>` sections with no `<h1>` above them, so a
 * screen reader had nothing naming the page. One heading here beats five —
 * and it is visually hidden because the tab bar is already the visible label.
 */
const TAB_TITLE: Record<string, string> = {
  '/home': 'Home',
  '/workout': 'Workout',
  '/ranks': 'Ranks',
  '/friends': 'Friends',
  '/profile': 'Profile',
};

export interface ShellStats {
  level: { level: number; intoLevel: number; nextLevelXp: number };
  currency: number;
  avatar: { avatarId: string | null; profileImage: string | null; border: string };
  streak: { current: number; best: number; freezes: number };
}

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [stats, setStats] = useState<ShellStats | null>(null);
  const [streakOpen, setStreakOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/welcome');
  }, [user, loading, router]);

  // Level, Spark, streak and the identity picture in one call. This used to
  // read `/home/summary` for the streak alone and pass neither of the other
  // two, on a comment saying they arrived with P11's ledger — P11 shipped, and
  // the app had been showing a level and a balance nowhere ever since.
  const loadStats = useCallback(() => {
    if (!user) return;
    gameApi
      .me()
      .then((r) => setStats(r.data))
      .catch(() => {});
  }, [user]);

  useEffect(loadStats, [loadStats, pathname]);

  // Claiming a reward happens inside a panel, without navigating — so the bar
  // has to be told, or it keeps showing the balance from before the claim.
  useEffect(() => {
    window.addEventListener(STATS_CHANGED, loadStats);
    return () => window.removeEventListener(STATS_CHANGED, loadStats);
  }, [loadStats]);

  if (loading) return <BrandLoader />;
  if (!user) return null;

  return (
    <div className="min-h-[100dvh] pb-[72px]">
      <TopBar
        level={stats?.level.level}
        levelProgress={
          stats && stats.level.nextLevelXp > 0 ? stats.level.intoLevel / stats.level.nextLevelXp : 0
        }
        streak={stats?.streak.current ?? 0}
        currency={stats?.currency}
        avatar={
          <UserAvatar
            size={38}
            ring={2.5}
            user={stats?.avatar ?? { avatarId: (user as any).avatarId, profileImage: user.profileImage }}
          />
        }
        onStreak={() => setStreakOpen(true)}
        onCurrency={() => router.push('/profile?view=store')}
        onAction={() => router.push('/profile')}
      />
      <main id="main" className="mx-auto max-w-2xl px-4 py-4">
        <h1 className="sr-only">{TAB_TITLE[pathname ?? ''] ?? 'RepRush'}</h1>
        <OfflineBanner />
        {children}
      </main>
      <ActiveSessionBar />
      <TabBar />
      <StreakSheet
        open={streakOpen}
        onOpenChange={setStreakOpen}
        streak={stats?.streak}
        onQuests={() => {
          setStreakOpen(false);
          router.push('/profile?view=quests');
        }}
      />
    </div>
  );
}

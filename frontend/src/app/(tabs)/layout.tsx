'use client';
/**
 * The v2 tab shell: global top bar, scrolling content, bottom tab bar.
 *
 * A route group, so it wraps the new tabs without adding a URL segment — and
 * without colliding with v1's `/workout` and `/profile`, which still live at
 * `app/workout` and `app/profile` until P6 and P10 replace them.
 */
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { homeApi } from '@/lib/api';
import { BrandLoader } from '@/components/ui/motion-primitives';
import { TabBar } from '@/components/layout/tab-bar';
import { TopBar } from '@/components/layout/top-bar';
import OfflineBanner from '@/components/layout/offline-banner';
import { Mascot, type MascotPose } from '@/components/art/mascot';

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

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/welcome');
  }, [user, loading, router]);

  // The streak is the one top-bar number that exists today; level and currency
  // arrive with P11's XP ledger. Cheap because /home/summary is cached.
  useEffect(() => {
    if (!user) return;
    homeApi
      .summary()
      .then((r) => setStreak(r.data?.user?.streak ?? 0))
      .catch(() => {});
  }, [user]);

  if (loading) return <BrandLoader />;
  if (!user) return null;

  return (
    <div className="min-h-[100dvh] pb-[72px]">
      <TopBar
        streak={streak}
        avatar={<Mascot pose={((user as any).avatarId as MascotPose) || 'idle'} size={30} />}
        onAction={() => router.push('/profile')}
      />
      <main id="main" className="mx-auto max-w-2xl px-4 py-4">
        <h1 className="sr-only">{TAB_TITLE[pathname ?? ''] ?? 'RepRush'}</h1>
        <OfflineBanner />
        {children}
      </main>
      <TabBar />
    </div>
  );
}

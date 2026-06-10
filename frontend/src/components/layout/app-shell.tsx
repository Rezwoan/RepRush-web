'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Sidebar from './sidebar';
import MobileNav from './mobile-nav';
import { BrandLoader } from '@/components/ui/motion-primitives';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = user?.role === 'admin';
  const onAdmin = pathname.startsWith('/admin');

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    // Admins live only in the admin panel; regular users can't reach it.
    if (isAdmin && !onAdmin) router.replace('/admin');
    if (!isAdmin && onAdmin) router.replace('/dashboard');
  }, [user, loading, isAdmin, onAdmin, router]);

  if (loading) return <BrandLoader />;
  if (!user) return null;
  if (isAdmin !== onAdmin) return <BrandLoader />; // redirecting

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto px-4 py-5 lg:px-8 lg:py-7 pb-24 lg:pb-8">
          {children}
        </main>

        <div className="lg:hidden">
          <MobileNav />
        </div>
      </div>
    </div>
  );
}

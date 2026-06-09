'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Sidebar from './sidebar';
import MobileNav from './mobile-nav';
import { BrandLoader } from '@/components/ui/motion-primitives';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading) return <BrandLoader />;
  if (!user) return null;

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

'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { BrandLoader } from '@/components/ui/motion-primitives';
import { setupInProgress } from './welcome/config';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // Signed out goes to the funnel, not the login form: v2 is self-serve, and
    // /welcome's splash offers "I already have an account" for returning users.
    if (!user) return router.replace('/welcome');
    // Signed in but part-way through setup — an account is created before the
    // questions now, so walking away mid-funnel leaves a real account with no
    // sex or bodyweight, which is an account the rank engine cannot score.
    // Put them back where they stopped rather than on a home screen of blanks.
    router.replace(setupInProgress() ? '/welcome' : '/home');
  }, [user, loading, router]);

  return <BrandLoader />;
}

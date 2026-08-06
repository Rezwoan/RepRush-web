'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { BrandLoader } from '@/components/ui/motion-primitives';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Signed out goes to the funnel, not the login form: v2 is self-serve, and
    // /welcome's splash offers "I already have an account" for returning users.
    if (!loading) router.replace(user ? '/dashboard' : '/welcome');
  }, [user, loading, router]);

  return <BrandLoader />;
}

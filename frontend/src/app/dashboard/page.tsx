'use client';
/**
 * v1's dashboard was the app's shell; the tab group is now. It is kept only as
 * a redirect, because it is the URL every existing user has bookmarked and the
 * one v1's own sidebar still points at.
 *
 * The screen itself is gone. Its charts are the Profile cards, its heatmap is
 * `6-Month Activity`, and its creatine and supplement trackers — the only part
 * with no v2 equivalent — now live at Profile → Consumables.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BrandLoader } from '@/components/ui/motion-primitives';

export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => router.replace('/home'), [router]);
  return <BrandLoader />;
}

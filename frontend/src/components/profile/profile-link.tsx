'use client';
/**
 * A row that leads to the person it names.
 *
 * Friends, leaderboards and league standings all list people, and none of them
 * led anywhere: you could see somebody two places above you and had no way to
 * look at them. `/u/[username]` had existed since P9 with exactly one entry
 * point — the *Preview public profile* button on your own edit screen.
 *
 * Falls back to a plain element when there is no handle, which is the handful
 * of rows a deleted or half-migrated account leaves behind.
 */
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function ProfileLink({
  username,
  className,
  children,
}: {
  username: string | null | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  if (!username) return <div className={className}>{children}</div>;
  return (
    <Link href={`/u/${username}`} className={cn('press', className)}>
      {children}
    </Link>
  );
}

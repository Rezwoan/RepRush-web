'use client';
/**
 * Placeholder for a tab whose phase hasn't run yet.
 *
 * Not scaffolding: the bottom bar ships six tabs, and a tab that 404s is a
 * broken app. Each of these is deleted by the phase that builds the real
 * screen — the file exists so the nav is honest in the meantime.
 */
import Link from 'next/link';
import { EmptyState } from '@/components/ui/display';
import { Button } from '@/components/ui/button';

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState
      pose="sleep"
      title={title}
      description={description}
      action={
        <Link href="/home">
          <Button variant="chunkyOutline" size="cta">
            Back to Home
          </Button>
        </Link>
      }
    />
  );
}

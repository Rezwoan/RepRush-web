'use client';
/**
 * The app-wide error boundary (P13).
 *
 * Next's App Router catches a render error in any segment below the root layout
 * here. Without it a thrown error in one card blanks the entire screen — which,
 * mid-session, reads as "the app ate my sets".
 *
 * So it says the opposite, and it is true: nothing queued is lost, because the
 * outbox lives in localStorage and is drained by `OutboxSync` in the root
 * layout, which is *outside* this boundary and therefore still mounted.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mascot } from '@/components/art/mascot';
import { pendingCount } from '@/lib/offline';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    setQueued(pendingCount());
    // The digest is all a production build keeps; without it a report from the
    // owner ("it crashed") cannot be matched to a stack.
    console.error('[reprush] render error', error.digest ?? '', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-sm flex-col items-center justify-center gap-5 px-6 text-center">
      <Mascot pose="sad" size={140} float />
      <h1 className="text-2xl font-extrabold">That screen broke</h1>
      <p className="text-muted-foreground">
        {queued > 0
          ? `Not your data — ${queued} ${queued === 1 ? 'change is' : 'changes are'} still saved on this device and will sync.`
          : 'Nothing you logged is lost. Try that again, or head back to the app.'}
      </p>
      {error.digest && (
        <p className="nums text-xs text-muted-foreground/60">Reference {error.digest}</p>
      )}
      <div className="w-full space-y-2">
        <Button variant="chunky" size="cta" onClick={reset}>
          Try again
        </Button>
        <Button variant="chunkyOutline" size="cta" onClick={() => (window.location.href = '/home')}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}

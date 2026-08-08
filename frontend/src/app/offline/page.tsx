'use client';
/**
 * The offline fallback (SPEC §10 → Offline).
 *
 * The service worker serves this for any navigation it has no cached copy of.
 * It deliberately says what is *safe* rather than apologising: someone reading
 * it is mid-session in a basement, and the thing they need to know is that
 * their sets are not lost.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { flushOutbox, pendingCount, subscribe } from '@/lib/offline';
import { Button } from '@/components/ui/button';
import { Mascot } from '@/components/art/mascot';

export default function OfflinePage() {
  const router = useRouter();
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setQueued(pendingCount());
    sync();
    setOnline(navigator.onLine);
    const unsubscribe = subscribe(sync);
    const on = () => {
      setOnline(true);
      void flushOutbox();
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      unsubscribe();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-sm flex-col items-center justify-center gap-5 px-6 text-center">
      <Mascot pose={online ? 'idle' : 'sleep'} size={140} float />
      <h1 className="text-2xl font-extrabold">
        {online ? 'That page isn’t cached yet' : 'You’re offline'}
      </h1>
      <p className="text-muted-foreground">
        {queued > 0
          ? `Everything you logged is saved on this device — ${queued} ${queued === 1 ? 'change is' : 'changes are'} waiting to sync.`
          : 'Nothing is lost. Anything you log now is stored on this device and syncs when you are back.'}
      </p>
      <div className="w-full space-y-2">
        <Button variant="chunky" size="cta" onClick={() => router.push('/workout')}>
          Back to your workout
        </Button>
        <Button
          variant="chunkyOutline"
          size="cta"
          onClick={() => {
            void flushOutbox();
            router.refresh();
          }}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}

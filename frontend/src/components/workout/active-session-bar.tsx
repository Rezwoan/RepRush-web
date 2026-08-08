'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, ChevronRight } from 'lucide-react';
import { getActiveSession, subscribeActiveSession, type ActiveSession } from '@/lib/active-session';
import { spring } from '@/lib/motion';

/** mm:ss / h:mm:ss since the session started, derived from the clock. */
function elapsed(startedAt: string) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * "Workout in progress — Resume", docked above the tab bar on every tab.
 *
 * Before this, starting a session and then opening any other tab left no trace
 * of it anywhere except the Today's Workout card on Home, so the way back was
 * Home → find the card → Resume, and on Ranks or Profile there was no
 * indication you were mid-workout at all.
 *
 * The clock is derived from `startedAt` on a one-second tick rather than
 * counted down, the same rule the rest timer follows: a browser throttles
 * background intervals to once a minute, so anything counted would drift the
 * moment the phone locks.
 */
export default function ActiveSessionBar() {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [, tick] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  // Read in an effect, never during render: localStorage does not exist on the
  // server, so reading it while rendering makes the first client pass disagree
  // and React throws the tree away (the same rule as `useUnits`).
  useEffect(() => {
    const read = () => setSession(getActiveSession());
    read();
    return subscribeActiveSession(read);
  }, []);

  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [session]);

  // Pointless on the session screen itself, and on the finish/summary chain the
  // session is already over in every sense the user cares about.
  const onSessionRoute = pathname?.startsWith('/workout/session') || pathname?.startsWith('/workout/finish');
  if (!session || onSessionRoute) return null;

  return (
    <AnimatePresence>
      <motion.button
        type="button"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={spring.soft}
        onClick={() => router.push(`/workout/session/${session.id}`)}
        className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-full max-w-2xl items-center gap-3 border-t border-primary/30 bg-primary/15 px-4 py-2.5 text-left backdrop-blur-xl"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/25 text-primary">
          <Dumbbell size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-primary">
            Workout in progress
          </span>
          <span className="block truncate text-sm font-semibold">
            {session.title} · <span className="nums tabular-nums">{elapsed(session.startedAt)}</span>
          </span>
        </span>
        <span className="shrink-0 text-sm font-bold text-primary">Resume</span>
        <ChevronRight size={16} className="shrink-0 text-primary" />
      </motion.button>
    </AnimatePresence>
  );
}

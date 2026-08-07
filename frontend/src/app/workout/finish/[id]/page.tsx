'use client';
/**
 * The finish flow (SPEC §5.3).
 *
 * Its own route rather than a sheet on the session screen, so the browser back
 * button means "back to the session" — which is exactly what someone who tapped
 * Finish by accident wants, and what a sheet would have to reimplement.
 *
 * Completion goes through the outbox like everything else. `Add Media` and
 * `Tag Friends` are deliberately absent: both need P9's posts, and a control
 * that opens nothing is worse than one that is not there yet.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronRight, Pill, X } from 'lucide-react';
import {
  flushOutbox, getCachedSession, materializeSets, queueBodyWeight, queueCompleteSession,
  resolveSessionId,
} from '@/lib/offline';
import { hhmmss } from '@/components/workout/rest-timer';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Toggle } from '@/components/ui/controls';
import { useUnits } from '@/lib/units';
import { cn } from '@/lib/utils';

type Privacy = 'private' | 'friends' | 'discovery';

export default function FinishPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = resolveSessionId(parseInt(id, 10));

  const [caption, setCaption] = useState('');
  const [bodyweight, setBodyweight] = useState('');
  const u = useUnits();
  const [tracked, setTracked] = useState(true);
  const [discovery, setDiscovery] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [privacy, setPrivacy] = useState<Privacy>('friends');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const sets = useMemo(() => materializeSets(sessionId), [sessionId]);
  const working = sets.filter((s) => !s.isWarmup);

  useEffect(() => {
    const cached = getCachedSession(sessionId);
    if (cached?.startedAt) {
      setElapsed(Math.floor((Date.now() - new Date(cached.startedAt).getTime()) / 1000));
    }
  }, [sessionId]);

  const finish = async () => {
    if (busy) return;
    setBusy(true);

    const kg = u.wkg(parseFloat(bodyweight));
    // Queued like everything else here. It used to be a fire-and-forget POST,
    // which quietly dropped the entry for anyone finishing a session offline —
    // the exact user this whole screen is built for.
    if (kg > 0) queueBodyWeight(kg);

    queueCompleteSession(sessionId, {
      caption: caption.trim() || undefined,
      tracked,
      privacy: discovery ? 'discovery' : privacy,
    });
    void flushOutbox();
    router.replace(`/workout/summary/${sessionId}`);
  };

  return (
    <div className="min-h-[100dvh] pb-32">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-xl">
        <button
          onClick={() => router.back()}
          aria-label="Back to session"
          className="press grid h-9 w-9 place-items-center rounded-full"
        >
          <X size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Duration</p>
          <p className="nums text-xl font-extrabold leading-none">{hhmmss(elapsed)}</p>
        </div>
        <p className="nums shrink-0 text-sm font-bold text-muted-foreground">
          {working.length} sets
        </p>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 py-4">
        <label className="surface block p-4">
          <span className="mb-1.5 block text-sm font-semibold text-muted-foreground">Caption</span>
          <textarea
            rows={3}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="How did it go?"
            className="w-full resize-none bg-transparent outline-none"
          />
        </label>

        <a
          href="/profile?view=consumables"
          className="surface press flex items-center gap-3 p-4 font-bold"
        >
          <Pill size={20} className="text-primary" />
          <span className="flex-1">Consumables</span>
          <ChevronRight size={18} className="text-muted-foreground" />
        </a>

        <label className="surface flex items-center gap-3 p-4">
          <span className="flex-1 font-bold">Bodyweight</span>
          <input
            inputMode="decimal"
            value={bodyweight}
            onChange={(e) => setBodyweight(e.target.value)}
            placeholder="—"
            className="nums w-24 rounded-xl border-2 border-border bg-card px-3 py-2 text-right text-lg font-extrabold outline-none focus:border-primary"
          />
          <span className="text-sm font-semibold text-muted-foreground">{u.w}</span>
        </label>

        <div className="surface flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-bold">Tracker</p>
            <p className="text-xs text-muted-foreground">Count this session toward stats, streak and ranks.</p>
          </div>
          <Toggle checked={tracked} onChange={setTracked} label="Count toward stats" />
        </div>

        <div className="surface flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-bold">Post in Discovery</p>
            <p className="text-xs text-muted-foreground">
              {discovery ? 'Anyone on RepRush can see this post.' : 'Only friends can see your post.'}
            </p>
          </div>
          <Toggle checked={discovery} onChange={setDiscovery} label="Post in Discovery" />
        </div>

        <button
          onClick={() => setPrivacyOpen(true)}
          className="surface press flex w-full items-center gap-3 p-4 text-left font-bold"
        >
          <span className="flex-1">Privacy settings</span>
          <span className="text-sm capitalize text-muted-foreground">{discovery ? 'discovery' : privacy}</span>
          <ChevronRight size={18} className="text-muted-foreground" />
        </button>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl px-4 pb-4 safe-bottom">
        <Button variant="chunky" size="cta" onClick={() => setConfirm(true)}>
          Finish Workout
        </Button>
      </div>

      <Sheet open={privacyOpen} onOpenChange={setPrivacyOpen} title="Who can see this?">
        <div className="space-y-2 pb-2">
          {(['private', 'friends', 'discovery'] as Privacy[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPrivacy(p);
                setDiscovery(p === 'discovery');
                setPrivacyOpen(false);
              }}
              className={cn(
                'press w-full rounded-xl border-2 p-3.5 text-left font-bold capitalize',
                (discovery ? 'discovery' : privacy) === p ? 'border-primary bg-primary/10' : 'border-border bg-card',
              )}
            >
              {p}
              <span className="block text-xs font-normal text-muted-foreground">
                {{
                  private: 'Only you.',
                  friends: 'People you have added.',
                  discovery: 'Everyone on RepRush.',
                }[p]}
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={confirm}
        onOpenChange={setConfirm}
        title="🏁 Finish Workout"
        description="Are you ready to finish this workout session and post it?"
        footer={
          <div className="flex gap-3">
            <Button variant="chunkyOutline" size="cta" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="chunky" size="cta" disabled={busy} onClick={finish}>
              {busy ? 'Finishing…' : 'Yes'}
            </Button>
          </div>
        }
      >
        <p className="pb-2 text-sm text-muted-foreground">
          {working.length} working sets logged over {hhmmss(elapsed)}.
        </p>
      </Sheet>
    </div>
  );
}

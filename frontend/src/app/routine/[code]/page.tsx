'use client';
/**
 * A shared program, opened from a friend's link.
 *
 * Outside the tab shell — like `/u/:username` — because a link someone forwards
 * has to open on its own. It shows the whole program before asking for a
 * decision, because "add this" without knowing what is in it is not a choice.
 *
 * Taking it is a **fork**: it copies into your library and is yours from then
 * on. Shared ownership would mean one person's edit rewriting someone else's
 * training week, which is not what "make their own" asks for.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, Download } from 'lucide-react';
import { profileApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { BrandLoader } from '@/components/ui/motion-primitives';
import { EmptyState } from '@/components/ui/display';

interface Shared {
  code: string;
  name: string;
  owner: { name: string; username: string | null } | null;
  routines: { name: string; exercises: { name: string; sets: number; repMin: number; repMax: number }[] }[];
}

export default function SharedRoutinePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [data, setData] = useState<Shared | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    profileApi
      .sharedFolder(code)
      .then((r) => {
        setData(r.data);
        setState('ready');
      })
      .catch(() => setState('missing'));
  }, [code]);

  useEffect(() => {
    if (!loading && !user) {
      // Sign in first, then come back here rather than to the home tab.
      router.replace(`/login?next=${encodeURIComponent(`/routine/${code}`)}`);
      return;
    }
    if (user) load();
  }, [user, loading, code, router, load]);

  const claim = async () => {
    setClaiming(true);
    setError('');
    try {
      await profileApi.claimSharedFolder(code);
      setClaimed(true);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not add that program.');
    } finally {
      setClaiming(false);
    }
  };

  if (loading || state === 'loading') return <BrandLoader />;

  return (
    <main id="main" className="mx-auto min-h-[100dvh] max-w-2xl px-4 py-4 safe-top">
      <button
        onClick={() => router.push('/workout')}
        className="press -ml-1 mb-3 flex items-center gap-1 text-sm font-bold text-primary"
      >
        <ArrowLeft size={16} /> Workout
      </button>

      {state === 'missing' && (
        <EmptyState
          pose="sad"
          title="That link is not valid"
          description="The program may have been unshared, or the link was mistyped."
          action={
            <Button variant="chunky" size="cta" onClick={() => router.push('/workout')}>
              Go to your routines
            </Button>
          }
        />
      )}

      {state === 'ready' && data && (
        <>
          <h1 className="text-[26px] font-extrabold leading-tight">{data.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data.owner ? `Shared by ${data.owner.name}` : 'Shared program'} ·{' '}
            {data.routines.length} day{data.routines.length === 1 ? '' : 's'}
          </p>

          <div className="mt-5 space-y-3 pb-28">
            {data.routines.map((r, i) => (
              <section key={`${r.name}-${i}`} className="surface p-4">
                <h2 className="font-extrabold">{r.name}</h2>
                <ul className="mt-2 space-y-1">
                  {r.exercises.map((e, j) => (
                    <li key={`${e.name}-${j}`} className="flex items-baseline gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{e.name}</span>
                      <span className="nums shrink-0 text-xs text-muted-foreground">
                        {e.sets} × {e.repMin}–{e.repMax}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl px-4 pb-3 safe-bottom">
            {error && <p className="mb-2 text-sm font-bold text-destructive">{error}</p>}
            {claimed ? (
              <Button variant="chunky" size="cta" className="w-full" onClick={() => router.push('/workout')}>
                <Check size={18} /> Added — open my routines
              </Button>
            ) : (
              <Button
                variant="chunky"
                size="cta"
                className="w-full"
                disabled={claiming}
                onClick={claim}
              >
                <Download size={18} /> {claiming ? 'Adding…' : 'Add to my routines'}
              </Button>
            )}
            <p className="mt-2 text-center text-xs text-muted-foreground">
              You get your own copy — edit it however you like.
            </p>
          </div>
        </>
      )}
    </main>
  );
}

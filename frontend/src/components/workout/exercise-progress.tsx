'use client';
/**
 * One exercise, every session, every set.
 *
 * The question this answers is the one people actually ask mid-set — *what did
 * I do last time, and the time before?* — so it shows the sets themselves, not
 * a summary of them. A chart of top weights cannot tell you that last week's
 * 100 was a single and this week's is a triple.
 *
 * It renders inside a `Sheet` from the session screen deliberately: opening it
 * is not a navigation, so closing it cannot lose the session's drafts, its
 * focused cell or its rest timer. "Back with zero friction" is achieved by
 * never leaving.
 */
import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { workoutsApi } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/display';

interface ProgressSet {
  setNumber: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}

interface ProgressSession {
  sessionId: number;
  date: string | null;
  sets: ProgressSet[];
  topWeightKg: number;
  e1rm: number;
  volumeKg: number;
  totalReps: number;
  workingSets: number;
  isPR: boolean;
}

export interface ExerciseProgressData {
  exerciseId: string;
  name: string;
  sessions: ProgressSession[];
  best: { weightKg: number; reps: number; e1rm: number } | null;
  totals: { sessions: number; sets: number; reps: number; volumeKg: number } | null;
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
};

/**
 * Estimated-1RM sparkline, oldest to newest. e1RM rather than top weight,
 * because dropping the load and adding reps is progress and a top-weight line
 * would draw it as a decline.
 */
function Trend({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const w = 100;
  const h = 28;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - lo) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ExerciseProgress({ exerciseId }: { exerciseId: string }) {
  const u = useUnits();
  const [data, setData] = useState<ExerciseProgressData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let live = true;
    setState('loading');
    workoutsApi
      .progress(exerciseId)
      .then((r) => {
        if (!live) return;
        setData(r.data);
        setState('ready');
      })
      .catch(() => live && setState('error'));
    return () => {
      live = false;
    };
  }, [exerciseId]);

  if (state === 'loading') return <div className="surface h-56 animate-pulse opacity-60" />;
  if (state === 'error')
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Couldn&apos;t load this history. Your logged sets are safe.
      </p>
    );

  if (!data?.sessions.length)
    return (
      <EmptyState
        pose="idle"
        title="No history yet"
        description="Log this exercise once and every session after it shows up here, set by set."
      />
    );

  // Oldest → newest for the trend line; the list below stays newest first.
  const trend = data.sessions.map((s) => s.e1rm).reverse();

  return (
    <div className="space-y-4">
      <div className="surface p-4">
        <div className="flex items-end gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Heaviest
            </p>
            <p className="nums text-2xl font-extrabold leading-tight">
              {data.best ? `${u.wv(data.best.weightKg, 1)} ${u.w} × ${data.best.reps}` : '—'}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Best est. 1RM
            </p>
            <p className="nums text-2xl font-extrabold leading-tight">
              {data.best ? `${u.wv(data.best.e1rm, 1)} ${u.w}` : '—'}
            </p>
          </div>
        </div>
        <Trend points={trend} />
        <p className="nums mt-1 text-xs text-muted-foreground">
          {data.totals?.sessions} session{data.totals?.sessions === 1 ? '' : 's'} ·{' '}
          {data.totals?.sets} sets · {data.totals?.reps.toLocaleString('en-US')} reps ·{' '}
          {u.volume(data.totals?.volumeKg ?? 0)} lifted
        </p>
      </div>

      <ul className="space-y-2.5">
        {data.sessions.map((s) => (
          <li key={s.sessionId} className={cn('surface p-3', s.isPR && 'border-volt-400')}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-extrabold">{fmtDate(s.date)}</span>
              {s.isPR && (
                <span className="flex items-center gap-1 rounded-full bg-volt-400/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-volt-400">
                  <Trophy size={11} /> Best yet
                </span>
              )}
              <span className="nums ml-auto text-xs text-muted-foreground">
                {u.volume(s.volumeKg)} · {s.totalReps} reps
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {s.sets.map((set) => (
                <span
                  key={set.setNumber}
                  className={cn(
                    'nums rounded-lg px-2 py-1 text-sm font-bold',
                    set.isWarmup
                      ? 'bg-tier-gold/15 text-tier-gold'
                      : 'bg-secondary text-foreground',
                  )}
                  // `weightKg` is the *added* weight, so a pull-up logs 0 — the
                  // P7 lesson. Show the reps alone rather than "0 kg × 8".
                  title={set.isWarmup ? 'Warm-up set' : `Set ${set.setNumber}`}
                >
                  {set.weightKg > 0 ? `${u.wv(set.weightKg, 1)}×${set.reps}` : `${set.reps} reps`}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

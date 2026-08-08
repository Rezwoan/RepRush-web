'use client';
/**
 * Analysis — rebuilt around the questions people actually ask.
 *
 * The first version had four sections and the owner could not read any of them:
 * *Average Ranks* per catalog category (strength / powerlifting / strongman —
 * words from the exercise database, not from training), *Predictions* (the same
 * prescription the session's rank strip already shows, one tap from where you
 * would act on it), *Statistics* (a bare "Number of Rank Ups: 12" over a week
 * strip with no stated period), and *Rank Distribution* (a donut with no
 * sentence saying what was being counted).
 *
 * So this is three sections, each led by a plain sentence stating what it is:
 *
 *   1. **Am I getting stronger on this lift?** — every exercise, tap for its
 *      full history, set by set. This is the one people asked for and the only
 *      thing here that could not be read off another screen.
 *   2. **Where do my lifts sit on the ladder?** — the distribution, with the
 *      count spelled out.
 *   3. **How often am I moving up?** — rank-ups, with the word defined and the
 *      period named.
 *
 * Two sections were deleted rather than explained. *Average Ranks* by category
 * answers "which muscles are strong", which the Bodygraph on the Your Rank tab
 * already answers better and anatomically. *Predictions* is the rank strip.
 * Explaining a duplicate does not make it worth reading.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { MUSCLE_BY_ID, type MuscleId } from '@/lib/muscles';
import { TIERS, TIER_LABEL, rankLabel, rankValue, type Tier } from '@/lib/ranks';
import { useUnits } from '@/lib/units';
import { getPrefs } from '@/lib/feedback';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/display';
import { Sheet } from '@/components/ui/sheet';
import { RankBadge } from '@/components/art/rank-badge';
import { Thumb, useCatalog } from '@/components/workout/exercise-picker';
import { ExerciseProgress } from '@/components/workout/exercise-progress';
import { bestLabel, tierColor, type Overview } from './types';

/** Sunday-first, rotated below to whichever day Settings → Calendar picks. */
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A donut arc set. Values are counts; the ring is drawn clockwise from 12. */
function Donut({ slices, hole }: { slices: { tier: Tier; count: number }[]; hole: string }) {
  const total = slices.reduce((n, s) => n + s.count, 0) || 1;
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="relative grid h-40 w-40 shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="h-40 w-40 -rotate-90" aria-hidden>
        <circle cx={50} cy={50} r={R} fill="none" stroke="hsl(var(--muted-foreground)/.15)" strokeWidth={13} />
        {slices.map((s) => {
          const len = (s.count / total) * C;
          const el = (
            <circle
              key={s.tier}
              cx={50}
              cy={50}
              r={R}
              fill="none"
              stroke={`hsl(var(--tier-${s.tier}))`}
              strokeWidth={13}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute text-center">
        <p className="nums text-3xl font-extrabold leading-none">{total}</p>
        <p className="text-xs font-bold text-muted-foreground">{hole}</p>
      </div>
    </div>
  );
}

/** A section, and the sentence that says what it is. Never one without the other. */
function Section({
  title,
  blurb,
  action,
  children,
}: {
  title: string;
  blurb: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-1 flex items-end justify-between gap-2">
        <h2 className="text-[22px] font-bold">{title}</h2>
        {action}
      </div>
      <p className="mb-2.5 text-sm text-muted-foreground">{blurb}</p>
      {children}
    </section>
  );
}

export function AnalysisPanel({ data }: { data: Overview }) {
  const { byId } = useCatalog();
  const u = useUnits();
  const [scope, setScope] = useState(0);
  const [query, setQuery] = useState('');
  const [openExercise, setOpenExercise] = useState<{ id: string; name: string } | null>(null);

  // Settings → Calendar. In an effect, like every preference: it comes from
  // localStorage, which the server pass cannot see.
  const [firstDay, setFirstDay] = useState(0);
  useEffect(() => setFirstDay(getPrefs().weekStart === 'sunday' ? 0 : 1), []);
  const days = useMemo(() => [...DAYS.slice(firstDay), ...DAYS.slice(0, firstDay)], [firstDay]);

  // ── rank-ups, this week ───────────────────────────────────────────
  const week = useMemo(() => {
    const now = new Date();
    // `+ 7` before the modulo: under a Monday start, Sunday is six days into
    // the week that has already begun, not minus one day of the next.
    const column = (d: Date) => (d.getDay() - firstDay + 7) % 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - column(now));
    const counts = [0, 0, 0, 0, 0, 0, 0];
    let total = 0;
    for (const iso of data.rankUps) {
      const d = new Date(iso);
      if (d >= start) {
        counts[column(d)]++;
        total++;
      }
    }
    return { counts, today: column(now), total };
  }, [data.rankUps, firstDay]);

  // ── distribution, filterable by body region ───────────────────────
  const scopes = useMemo(() => {
    const groups = Array.from(
      new Set(data.exercises.map((r) => MUSCLE_BY_ID[r.primaryMuscle as MuscleId]?.group).filter(Boolean)),
    ) as string[];
    return [{ id: null as string | null, label: 'All lifts' }, ...groups.map((g) => ({ id: g, label: g }))];
  }, [data.exercises]);

  const active = scopes[Math.min(scope, scopes.length - 1)];
  const inScope = active?.id
    ? data.exercises.filter((r) => MUSCLE_BY_ID[r.primaryMuscle as MuscleId]?.group === active.id)
    : data.exercises;

  const slices = useMemo(() => {
    const counts = new Map<Tier, number>();
    for (const r of inScope) counts.set(r.rank.tier, (counts.get(r.rank.tier) ?? 0) + 1);
    return TIERS.filter((t) => counts.has(t)).map((t) => ({ tier: t, count: counts.get(t)! }));
  }, [inScope]);

  // ── the exercise list, strongest first ────────────────────────────
  const lifts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.exercises
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => rankValue(b.rank) - rankValue(a.rank));
  }, [data.exercises, query]);

  if (!data.exercises.length) {
    return (
      <EmptyState
        pose="idle"
        title="Nothing to analyse yet"
        description="Log a few sets and this fills with every lift's history and where your ranks sit."
      />
    );
  }

  return (
    <div>
      <Section
        title="Your lifts"
        blurb="Tap any lift to see every session you have done it — set by set, with your best marked."
      >
        {data.exercises.length > 6 && (
          <div className="relative mb-2">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your lifts"
              aria-label="Search your lifts"
              className="w-full rounded-2xl border-2 border-border bg-card py-2.5 pl-9 pr-3 font-semibold outline-none focus:border-primary"
            />
          </div>
        )}

        <div className="space-y-1.5">
          {lifts.map((r) => {
            const ex = byId[r.exerciseId];
            return (
              <button
                key={r.exerciseId}
                onClick={() => setOpenExercise({ id: r.exerciseId, name: r.name })}
                className="press surface flex w-full items-center gap-3 p-3 text-left"
              >
                {ex && <Thumb ex={ex} size={40} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.name}</p>
                  <p className="nums text-xs text-muted-foreground">
                    Best {bestLabel(r.bestWeightKg, r.bestReps, u)}
                  </p>
                </div>
                <span
                  className="shrink-0 text-xs font-extrabold uppercase tracking-wide"
                  style={{ color: tierColor(r.rank) }}
                >
                  {rankLabel(r.rank)}
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
              </button>
            );
          })}
          {!lifts.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No lift matches &ldquo;{query}&rdquo;.
            </p>
          )}
        </div>
      </Section>

      <Section
        title="Where your lifts stand"
        blurb={`Each lift you have ranked sits in a tier. These are your ${inScope.length} ${
          active?.id ? `${active.label} ` : ''
        }lift${inScope.length === 1 ? '' : 's'}, counted by tier.`}
      >
        <div className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              onClick={() => setScope((s) => (s - 1 + scopes.length) % scopes.length)}
              aria-label="Previous filter"
              className="press grid h-8 w-8 place-items-center rounded-full bg-secondary text-muted-foreground"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-extrabold capitalize">{active?.label}</span>
            <button
              onClick={() => setScope((s) => (s + 1) % scopes.length)}
              aria-label="Next filter"
              className="press grid h-8 w-8 place-items-center rounded-full bg-secondary text-muted-foreground"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <Donut slices={slices} hole={inScope.length === 1 ? 'lift' : 'lifts'} />
            <ul className="min-w-0 flex-1 space-y-1.5">
              {slices
                .slice()
                .sort(
                  (a, b) =>
                    rankValue({ tier: b.tier, division: 1, lp: 0 }) -
                    rankValue({ tier: a.tier, division: 1, lp: 0 }),
                )
                .map((s) => (
                  <li key={s.tier} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: `hsl(var(--tier-${s.tier}))` }}
                    />
                    <span className="min-w-0 flex-1 truncate font-bold">{TIER_LABEL[s.tier]}</span>
                    <span className="nums shrink-0 text-muted-foreground">{s.count}</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section
        title="Moving up"
        blurb="A rank-up is any time one of your lifts crosses into a higher division. This is the current week."
      >
        <div className="surface p-4">
          <p className="nums text-4xl font-extrabold leading-none">{week.total}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {week.total === 0
              ? 'None yet this week — beat a lift you have already ranked and it lands here.'
              : `rank-up${week.total === 1 ? '' : 's'} this week, ${data.rankUps.length} all time.`}
          </p>
          <div className="mt-4 flex justify-between gap-1">
            {days.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className={cn(
                    'nums grid h-9 w-full place-items-center rounded-lg text-sm font-extrabold',
                    week.counts[i]
                      ? 'bg-primary-fill text-primary-foreground'
                      : 'bg-secondary text-muted-foreground',
                    i === week.today && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                  )}
                >
                  {week.counts[i]}
                </span>
                <span className="text-[11px] font-bold text-muted-foreground">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Sheet
        open={!!openExercise}
        onOpenChange={(v) => !v && setOpenExercise(null)}
        title={openExercise?.name ?? ''}
      >
        <div className="pb-2">
          {openExercise && <ExerciseProgress exerciseId={openExercise.id} />}
        </div>
      </Sheet>
    </div>
  );
}

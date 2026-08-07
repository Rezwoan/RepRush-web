'use client';
/**
 * Analysis — SPEC §6. Average Ranks, Predictions, Statistics, Rank Distribution.
 *
 * Everything here is derived from the one `GET /ranks/me` the tab already
 * fetched plus the cached catalog; nothing needs its own request. The donut is
 * a stroke-dasharray circle rather than a chart library — recharts is installed
 * but a single ring of arcs does not need an axis system.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MUSCLE_BY_ID, type MuscleId } from '@/lib/muscles';
import { TIERS, TIER_LABEL, rankLabel, rankValue, type Tier } from '@/lib/ranks';
import { useUnits } from '@/lib/units';
import { getPrefs } from '@/lib/feedback';
import { cn } from '@/lib/utils';
import { Bar, EmptyState } from '@/components/ui/display';
import { RankBadge } from '@/components/art/rank-badge';
import { Thumb, useCatalog } from '@/components/workout/exercise-picker';
import { bestLabel, targetLabel, tierColor, type Overview } from './types';

/** Sunday-first, and rotated below to whichever day Settings → Calendar picks. */
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A donut arc set. Values are counts; the ring is drawn clockwise from 12 o'clock. */
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
          const dash = `${len} ${C - len}`;
          const el = (
            <circle
              key={s.tier}
              cx={50}
              cy={50}
              r={R}
              fill="none"
              stroke={`hsl(var(--tier-${s.tier}))`}
              strokeWidth={13}
              strokeDasharray={dash}
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

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-end justify-between">
        <h2 className="text-[22px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AnalysisPanel({ data }: { data: Overview }) {
  const { byId } = useCatalog();
  const u = useUnits();
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [scope, setScope] = useState(0);
  // Settings → Calendar. In an effect, like every other preference: it comes
  // from localStorage, which the server pass cannot see.
  const [firstDay, setFirstDay] = useState(0);
  useEffect(() => setFirstDay(getPrefs().weekStart === 'sunday' ? 0 : 1), []);
  const days = useMemo(() => [...DAYS.slice(firstDay), ...DAYS.slice(0, firstDay)], [firstDay]);

  const categories = data.categories;

  // ── Statistics: rank-ups, this week Su–Sa ─────────────────────────
  const week = useMemo(() => {
    const now = new Date();
    // `+ 7` before the modulo: under a Monday start, Sunday is six days into
    // the week that has already begun, not minus one day of the next.
    const column = (d: Date) => (d.getDay() - firstDay + 7) % 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - column(now));
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const iso of data.rankUps) {
      const d = new Date(iso);
      if (d >= start) counts[column(d)]++;
    }
    return { counts, today: column(now) };
  }, [data.rankUps, firstDay]);

  // ── Distribution, filterable by body region / muscle group ────────
  const scopes = useMemo(() => {
    const groups = Array.from(
      new Set(data.exercises.map((r) => MUSCLE_BY_ID[r.primaryMuscle as MuscleId]?.group).filter(Boolean)),
    ) as string[];
    return [{ id: null as string | null, label: 'All ranks' }, ...groups.map((g) => ({ id: g, label: g }))];
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

  // ── Predictions: the same prescription the session's rank strip shows ──
  const predictions = useMemo(
    () => data.exercises.filter((r) => r.next).sort((a, b) => (b.next!.progress ?? 0) - (a.next!.progress ?? 0)),
    [data.exercises],
  );

  if (!data.exercises.length) {
    return (
      <EmptyState
        pose="idle"
        title="Nothing to analyse yet"
        description="Log a few sets and this fills with your averages, your next targets and where your ranks cluster."
      />
    );
  }

  return (
    <div>
      <Section
        title="Average Ranks"
        action={
          categories.length > 3 && (
            <button
              onClick={() => setShowAllCategories((v) => !v)}
              className="text-sm font-bold text-primary"
            >
              {showAllCategories ? 'Show less' : 'View all ›'}
            </button>
          )
        }
      >
        <div className="space-y-1.5">
          {(showAllCategories ? categories : categories.slice(0, 3)).map((c) => (
            <div key={c.category} className="surface flex items-center gap-3 p-3">
              <RankBadge
                tier={c.rank.tier}
                division={c.rank.division}
                size="sm"
                animated={false}
                showDivision={false}
              />
              <p className="min-w-0 flex-1 truncate font-bold capitalize">{c.category}</p>
              <span
                className="shrink-0 text-sm font-extrabold uppercase tracking-wide"
                style={{ color: tierColor(c.rank) }}
              >
                {rankLabel(c.rank)}
              </span>
              <span className="nums shrink-0 text-xs text-muted-foreground">{c.count}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Predictions">
        <div className="space-y-1.5">
          {predictions.slice(0, 8).map((r) => {
            const ex = byId[r.exerciseId];
            const n = r.next!;
            return (
              <div key={r.exerciseId} className="surface p-3">
                <div className="flex items-center gap-3">
                  {ex && <Thumb ex={ex} size={40} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{r.name}</p>
                    <p className="nums text-xs text-muted-foreground">
                      Best {bestLabel(r.bestWeightKg, r.bestReps, u)}
                    </p>
                  </div>
                  <RankBadge
                    tier={r.rank.tier}
                    division={r.rank.division}
                    size="sm"
                    animated={false}
                    showDivision={false}
                  />
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">
                    Next {rankLabel(n.rank)}
                  </span>
                  <Bar
                    value={n.progress}
                    color={tierColor(n.rank)}
                    className="flex-1"
                    height={8}
                    label={`Progress to ${rankLabel(n.rank)}`}
                  />
                  <span className="nums shrink-0 text-sm font-extrabold" style={{ color: tierColor(n.rank) }}>
                    {targetLabel(n, u)}
                  </span>
                </div>
              </div>
            );
          })}
          {!predictions.length && (
            <p className="text-sm text-muted-foreground">Every ranked lift is at the top of the ladder.</p>
          )}
        </div>
      </Section>

      <Section title="Statistics">
        <div className="surface p-4">
          <p className="text-sm text-muted-foreground">Number of Rank Ups</p>
          <p className="nums text-4xl font-extrabold leading-none">{data.rankUps.length}</p>
          <div className="mt-4 flex justify-between gap-1">
            {days.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className={cn(
                    'nums grid h-9 w-full place-items-center rounded-lg text-sm font-extrabold',
                    week.counts[i] ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
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

      <Section title="Rank Distribution">
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
            <Donut slices={slices} hole={slices.length === 1 ? 'Rank' : 'Ranks'} />
            <ul className="min-w-0 flex-1 space-y-1.5">
              {slices
                .slice()
                .sort((a, b) => rankValue({ tier: b.tier, division: 1, lp: 0 }) - rankValue({ tier: a.tier, division: 1, lp: 0 }))
                .map((s) => (
                  <li key={s.tier} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: `hsl(var(--tier-${s.tier}))` }}
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold">{TIER_LABEL[s.tier]}</span>
                    <span className="nums font-extrabold">{s.count}</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}

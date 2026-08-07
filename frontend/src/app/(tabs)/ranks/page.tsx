'use client';
/**
 * Ranks tab — SPEC §6. Six sub-tabs: Your Rank, Bodygraph, Leagues, Gallery,
 * Calculator, Analysis.
 *
 * Four of them (Your Rank, Bodygraph, Gallery, Analysis) are views of the same
 * `GET /ranks/me`, cached in localStorage so the tab paints instantly and still
 * paints offline — the same pattern as Home. Leagues and Calculator make their
 * own calls because they are about other people and about numbers you type.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { HelpCircle, Search, TrendingUp } from 'lucide-react';
import { ranksApi } from '@/lib/api';
import { spring } from '@/lib/motion';
import { MUSCLE_BY_ID, type MuscleId } from '@/lib/muscles';
import { TIERS, TIER_LABEL, rankLabel, rankValue, type Tier } from '@/lib/ranks';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip, TabBarLinks } from '@/components/ui/controls';
import { Bar, EmptyState, StatTile } from '@/components/ui/display';
import { Sheet } from '@/components/ui/sheet';
import { RankBadge } from '@/components/art/rank-badge';
import { BodygraphPair } from '@/components/art/bodygraph';
import { Thumb, useCatalog } from '@/components/workout/exercise-picker';
import { AnalysisPanel } from './analysis';
import { CalculatorPanel } from './calculator';
import { LeaguesPanel } from './leagues';
import { tierColor, type ExerciseRank, type MuscleRank, type Overview } from './types';

const CACHE_KEY = 'reprush_ranks_v1';

type Tab = 'rank' | 'body' | 'leagues' | 'gallery' | 'calc' | 'analysis';

const TABS: { value: Tab; label: string }[] = [
  { value: 'rank', label: 'Your Rank' },
  { value: 'body', label: 'Bodygraph' },
  { value: 'leagues', label: 'Leagues' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'calc', label: 'Calculator' },
  { value: 'analysis', label: 'Analysis' },
];

function readCache(): Overview | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Overview) : null;
  } catch {
    return null;
  }
}

function useOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ranksApi.me();
      setData(res.data);
      setError(false);
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(res.data));
      } catch {
        /* quota — the cache is an optimisation, not a requirement */
      }
    } catch {
      setError((prev) => prev || !readCache());
    }
  }, []);

  useEffect(() => {
    setData(readCache());
    setReady(true);
    load();
  }, [load]);

  return { data, ready, error, reload: load };
}

// ── Your Rank ────────────────────────────────────────────────────────

/** The placements row: ten hexes that fill in as exercises get ranked. */
function PlacementHexes({ done, required }: { done: number; required: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: required }, (_, i) => (
        <svg key={i} viewBox="0 0 20 22" className="h-6 flex-1" aria-hidden>
          <path
            d="M10 1 L18.7 6 V16 L10 21 L1.3 16 V6 Z"
            fill={i < done ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground)/.18)'}
            stroke={i < done ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground)/.35)'}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </div>
  );
}

function ExerciseRow({ r, onOpen }: { r: ExerciseRank; onOpen: () => void }) {
  const { byId } = useCatalog();
  const ex = byId[r.exerciseId];
  return (
    <button onClick={onOpen} className="surface press flex w-full items-center gap-3 p-3 text-left">
      {ex ? (
        <Thumb ex={ex} size={44} />
      ) : (
        <span className="h-11 w-11 shrink-0 rounded-xl bg-secondary" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{r.name}</p>
        <div className="mt-1 flex items-center gap-2">
          <Bar value={r.rank.lp / 100} color={tierColor(r.rank)} className="flex-1" height={6} label="LP" />
          <span className="nums shrink-0 text-[11px] font-extrabold text-muted-foreground">
            {r.rank.lp} LP
          </span>
        </div>
        <p className="nums mt-0.5 text-[11px] text-muted-foreground">
          Top {Math.max(1, Math.round(100 - r.rank.percentile))}% · {r.bestWeightKg} kg × {r.bestReps}
        </p>
      </div>
      <RankBadge tier={r.rank.tier} division={r.rank.division} size="sm" animated={false} />
    </button>
  );
}

function YourRank({ data, onExercise }: { data: Overview; onExercise: (r: ExerciseRank) => void }) {
  const router = useRouter();
  const { bodyrank, exercises } = data;
  const { done, required } = bodyrank.placements;
  const color = tierColor(bodyrank.rank);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
        className="mt-4 flex flex-col items-center gap-2 rounded-2xl p-6"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      >
        <RankBadge
          tier={bodyrank.rank.tier}
          division={bodyrank.rank.division}
          size="xl"
          locked={bodyrank.predicted}
          entrance
        />
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">
          {bodyrank.predicted ? 'Predicted Rank' : 'Your Bodyrank'}
        </p>
        <p className="text-3xl font-extrabold" style={{ color }}>
          {rankLabel(bodyrank.rank)}
        </p>
        <p className="text-center text-sm text-muted-foreground">
          {bodyrank.rank.tier === 'unranked'
            ? 'Log a set on any lift and the ladder starts.'
            : `Stronger than ${Math.round(bodyrank.rank.percentile)}% of lifters, across ${bodyrank.musclesTrained} trained muscles.`}
        </p>
      </motion.div>

      {bodyrank.predicted && (
        <div className="mt-3 rounded-2xl bg-brand-gradient p-[2px]">
          <div className="rounded-[calc(1rem-1px)] bg-card p-4">
            <p className="font-bold">
              Rank {required - done} more {required - done === 1 ? 'exercise' : 'exercises'} to get your
              RepRush rank
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Until then this is a prediction from what you have trained, not your real Bodyrank.
            </p>
            <div className="mt-3">
              <PlacementHexes done={done} required={required} />
            </div>
            <Button
              variant="chunky"
              size="cta"
              className="mt-4 w-full"
              onClick={() => router.push('/workout')}
            >
              Rank exercises
            </Button>
          </div>
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-2.5 text-[22px] font-bold">Rank Standings</h2>
        <div className="flex gap-3">
          <StatTile label="Weekly LP" value={bodyrank.weeklyLp} />
          <StatTile label="Ranked lifts" value={exercises.length} />
          <StatTile label="Muscles" value={`${bodyrank.musclesTrained}/21`} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2.5 text-[22px] font-bold">Your Exercises</h2>
        {exercises.length ? (
          <div className="space-y-1.5">
            {exercises.map((r) => (
              <ExerciseRow key={r.exerciseId} r={r} onOpen={() => onExercise(r)} />
            ))}
          </div>
        ) : (
          <EmptyState
            pose="idle"
            title="No ranked lifts yet"
            description="Every non-warm-up set you log with a weight and reps gets scored. Start a workout and this fills up."
            action={
              <Button variant="chunky" size="cta" onClick={() => router.push('/workout')}>
                Start a workout
              </Button>
            }
          />
        )}
      </section>
    </>
  );
}

// ── Bodygraph ────────────────────────────────────────────────────────

/** Tiers a body can actually reach, low → high, for the legend strip. */
const LEGEND_TIERS = TIERS.filter((t) => t !== 'unranked');

function BodygraphPanel({ data }: { data: Overview }) {
  const router = useRouter();
  const [open, setOpen] = useState<MuscleRank | null>(null);

  const colors = useMemo(() => {
    const out: Partial<Record<MuscleId, string>> = {};
    for (const m of data.muscles) {
      if (!(m.muscleId in MUSCLE_BY_ID)) continue;
      out[m.muscleId as MuscleId] =
        m.exercises > 0 ? tierColor(m.rank) : 'hsl(var(--muted-foreground) / 0.18)';
    }
    return out;
  }, [data.muscles]);

  const byId = useMemo(
    () => Object.fromEntries(data.muscles.map((m) => [m.muscleId, m])),
    [data.muscles],
  );

  const contributing = open
    ? data.exercises.filter((r) => r.primaryMuscle === open.muscleId)
    : [];

  return (
    <div className="mt-4">
      <div className="surface p-4">
        <BodygraphPair
          className="h-72"
          colors={colors}
          onMuscleClick={(id) => setOpen(byId[id] ?? null)}
        />
      </div>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
        {LEGEND_TIERS.map((t: Tier) => (
          <span
            key={t}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: `hsl(var(--tier-${t}))` }} />
            {TIER_LABEL[t]}
          </span>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        Every muscle is tinted by its own rank. Grey means untrained — and once placements are done,
        untrained muscles pull the Bodyrank down. Tap one to see what carries it.
      </p>

      <Sheet
        open={!!open}
        onOpenChange={(v) => !v && setOpen(null)}
        title={open?.label ?? ''}
        description={
          open?.exercises
            ? `${rankLabel(open.rank)} · ${Math.round(open.rank.percentile)}th percentile`
            : 'Not trained yet.'
        }
        footer={
          <Button variant="chunky" size="cta" onClick={() => router.push('/workout')}>
            Train this
          </Button>
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <RankBadge tier={open.rank.tier} division={open.rank.division} size="lg" />
              <div className="min-w-0 flex-1">
                <Bar
                  value={open.rank.lp / 100}
                  color={tierColor(open.rank)}
                  height={10}
                  label="LP in this division"
                />
                <p className="nums mt-1.5 text-sm font-extrabold">{open.rank.lp} LP</p>
                {open.decay > 0 && (
                  <p className="mt-1 text-xs font-semibold text-destructive">
                    {Math.round(open.decay * 100)}% withheld by decay — train it once to get it back.
                  </p>
                )}
              </div>
            </div>

            {contributing.length ? (
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-muted-foreground">Contributing exercises</p>
                {contributing.map((r) => (
                  <div key={r.exerciseId} className="flex items-center gap-2.5 rounded-xl bg-secondary p-2.5">
                    <RankBadge
                      tier={r.rank.tier}
                      division={r.rank.division}
                      size="xs"
                      animated={false}
                      showDivision={false}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.name}</span>
                    <span className="nums shrink-0 text-xs text-muted-foreground">{r.sets} sets</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing has trained this as its primary muscle yet.
              </p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ── Gallery ──────────────────────────────────────────────────────────

function GalleryPanel({ data, onExercise }: { data: Overview; onExercise: (r: ExerciseRank) => void }) {
  const { byId } = useCatalog();
  const [q, setQ] = useState('');
  const [tier, setTier] = useState<Tier | null>(null);

  const tiersPresent = useMemo(() => {
    const seen = new Set(data.exercises.map((r) => r.rank.tier));
    return TIERS.filter((t) => seen.has(t));
  }, [data.exercises]);

  const shown = data.exercises.filter(
    (r) =>
      (!tier || r.rank.tier === tier) &&
      (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())),
  );

  if (!data.exercises.length) {
    return (
      <EmptyState
        pose="idle"
        title="The cabinet is empty"
        description="Every lift you rank gets a card here, washed in its tier colour."
      />
    );
  }

  return (
    <div className="mt-4">
      <label className="flex items-center gap-2 rounded-xl border-2 border-border bg-card px-3.5 py-2.5">
        <Search size={16} className="shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your ranked lifts…"
          className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
        />
      </label>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
        <Chip active={!tier} onClick={() => setTier(null)}>
          All
        </Chip>
        {tiersPresent.map((t) => (
          <Chip key={t} active={tier === t} onClick={() => setTier(t)}>
            {TIER_LABEL[t]}
          </Chip>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {shown.map((r) => {
          const ex = byId[r.exerciseId];
          const color = tierColor(r.rank);
          return (
            <button
              key={r.exerciseId}
              onClick={() => onExercise(r)}
              className="press flex flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center"
              style={{
                borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
                background: `color-mix(in srgb, ${color} 12%, transparent)`,
              }}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color }}>
                  {rankLabel(r.rank)}
                </span>
                <span className="nums text-[11px] font-extrabold text-muted-foreground">{r.rank.lp} LP</span>
              </div>
              <RankBadge tier={r.rank.tier} division={r.rank.division} size="md" animated={false} />
              <p className="line-clamp-2 text-xs font-bold leading-tight">{r.name}</p>
              <div className="flex w-full gap-2">
                <span className="nums flex-1 rounded-lg bg-background/60 py-1.5 text-sm font-extrabold">
                  {r.bestWeightKg}
                  <span className="ml-0.5 text-[10px] font-bold text-muted-foreground">KG</span>
                </span>
                <span className="nums flex-1 rounded-lg bg-background/60 py-1.5 text-sm font-extrabold">
                  {r.bestReps}
                  <span className="ml-0.5 text-[10px] font-bold text-muted-foreground">REPS</span>
                </span>
              </div>
              <Bar value={r.rank.lp / 100} color={color} className="w-full" height={6} label="LP" />
              {ex && <span className="sr-only">{ex.equipment}</span>}
            </button>
          );
        })}
      </div>
      {!shown.length && (
        <p className="mt-6 text-center text-sm text-muted-foreground">Nothing matches that.</p>
      )}
    </div>
  );
}

// ── exercise detail ──────────────────────────────────────────────────

function ExerciseSheet({ r, onClose }: { r: ExerciseRank | null; onClose: () => void }) {
  const router = useRouter();
  const { byId } = useCatalog();
  const ex = r ? byId[r.exerciseId] : undefined;
  const muscle = r ? MUSCLE_BY_ID[r.primaryMuscle as MuscleId] : undefined;

  return (
    <Sheet
      open={!!r}
      onOpenChange={(v) => !v && onClose()}
      title={r?.name ?? ''}
      description={muscle ? `Primarily ${muscle.label}` : undefined}
      footer={
        <Button variant="chunky" size="cta" onClick={() => router.push('/workout')}>
          Train this
        </Button>
      }
    >
      {r && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {ex && <Thumb ex={ex} size={64} />}
            <RankBadge tier={r.rank.tier} division={r.rank.division} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-extrabold" style={{ color: tierColor(r.rank) }}>
                {rankLabel(r.rank)}
              </p>
              <p className="nums text-sm text-muted-foreground">
                Top {Math.max(1, Math.round(100 - r.rank.percentile))}% · {r.sets} sets
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <StatTile label="Best" value={`${r.bestWeightKg} × ${r.bestReps}`} />
            <StatTile label="Est. 1RM" value={r.bestE1rm} unit="kg" />
          </div>

          {r.next ? (
            <div className="surface p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">
                <TrendingUp size={13} /> To {rankLabel(r.next.rank)}
              </p>
              <p className="nums mt-1 text-3xl font-extrabold" style={{ color: tierColor(r.next.rank) }}>
                {r.next.weightKg === null ? `${r.next.reps} reps` : `${r.next.weightKg} kg × ${r.next.reps}`}
              </p>
              <Bar
                value={r.next.progress}
                color={tierColor(r.next.rank)}
                className="mt-3"
                height={10}
                label="Progress to the next division"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This lift is at the very top of the ladder. There is nothing above it.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ── page ─────────────────────────────────────────────────────────────

export default function RanksPage() {
  const { data, ready, error, reload } = useOverview();
  const params = useSearchParams();
  const initial = TABS.some((t) => t.value === params.get('tab')) ? (params.get('tab') as Tab) : 'rank';
  const [tab, setTab] = useState<Tab>(initial);
  const [detail, setDetail] = useState<ExerciseRank | null>(null);
  const [help, setHelp] = useState(false);

  if (!ready) return null;

  const needsData = tab !== 'leagues' && tab !== 'calc';

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <TabBarLinks value={tab} onChange={setTab} options={TABS} />
        </div>
        <button
          onClick={() => setHelp(true)}
          aria-label="How ranks work"
          className="press mb-2 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground"
        >
          <HelpCircle size={18} />
        </button>
      </div>

      {needsData && !data && (
        <EmptyState
          pose={error ? 'sad' : 'idle'}
          title={error ? "Can't reach the server" : 'Working out your rank…'}
          description={
            error
              ? 'Ranks are computed from your logged sets. This fills in when you are back online.'
              : undefined
          }
          action={
            error ? (
              <Button variant="chunkyOutline" size="cta" onClick={reload}>
                Try again
              </Button>
            ) : undefined
          }
        />
      )}

      {data && tab === 'rank' && <YourRank data={data} onExercise={setDetail} />}
      {data && tab === 'body' && <BodygraphPanel data={data} />}
      {data && tab === 'gallery' && <GalleryPanel data={data} onExercise={setDetail} />}
      {data && tab === 'analysis' && <AnalysisPanel data={data} />}
      {tab === 'leagues' && <LeaguesPanel />}
      {tab === 'calc' && <CalculatorPanel onSaved={reload} />}

      <ExerciseSheet r={detail} onClose={() => setDetail(null)} />

      <Sheet
        open={help}
        onOpenChange={setHelp}
        title="How ranks work"
        description="Strength for your bodyweight, sex and age — not how much you lift in absolute terms."
      >
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Every non-warm-up set becomes an estimated 1RM, which becomes a bodyweight multiple,
            which lands somewhere on the population curve for that lift. That percentile is your rank.
          </p>
          <p>
            Divisions run <span className="font-bold text-foreground">I → II → III</span>, so Titan III
            is the best Titan. Olympian is a single band with no divisions.
          </p>
          <p>
            Muscle ranks are the LP-weighted average of the lifts that train them; your Bodyrank
            weights those by muscle size. Untrained muscles count as zero once your ten placements are
            done — which is the whole point of the Bodygraph.
          </p>
          <p>
            Go 30 days without training a muscle and its rank bleeds slowly, to a floor. One set
            restores it, because nothing was ever written down.
          </p>
        </div>
        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
          {LEGEND_TIERS.map((t) => (
            <div key={t} className="flex shrink-0 flex-col items-center gap-1">
              <RankBadge tier={t} size="sm" animated={false} showDivision={false} />
              <span className="text-[10px] font-bold" style={{ color: `hsl(var(--tier-${t}))` }}>
                {TIER_LABEL[t]}
              </span>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

// ── self-check ────────────────────────────────────────────────────
// The legend and the ladder must agree, or the strip teaches a ladder the
// engine does not use. Cheap, and it runs wherever this module is imported.
if (LEGEND_TIERS.length !== TIERS.length - 1) throw new Error('legend strip lost a tier');
if (rankValue({ tier: 'olympian', division: 1, lp: 0 }) <= rankValue({ tier: 'titan', division: 3, lp: 100 }))
  throw new Error('the apex is not the apex');

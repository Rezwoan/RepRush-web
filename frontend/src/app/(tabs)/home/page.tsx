'use client';
/**
 * Home tab — SPEC §4. Three sub-tabs; For You carries all the real content and
 * Friends / Discovery are feed shells until P9 builds posts.
 *
 * Everything comes from one `GET /home/summary`, cached in localStorage so the
 * tab paints instantly (and still paints offline) while the fresh copy loads.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CalendarDays, Calculator, ChevronRight, Plus, Trophy, Users } from 'lucide-react';
import { bodyWeightApi, goalsApi, homeApi } from '@/lib/api';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { MUSCLE_BY_ID, type MuscleId } from '@/lib/muscles';
import { Button } from '@/components/ui/button';
import { Chip, TabBarLinks } from '@/components/ui/controls';
import { Bar, EmptyState, StatTile } from '@/components/ui/display';
import { Sheet } from '@/components/ui/sheet';
import { BodygraphPair } from '@/components/art/bodygraph';
import { Mascot } from '@/components/art/mascot';

// ── types (mirrors backend/src/home/home.service.ts) ─────────────────

interface Summary {
  user: { name: string; avatarId: string | null; streak: number; bestStreak: number };
  today: {
    state: 'resume' | 'start';
    sessionId: number | null;
    title: string;
    subtitle: string;
    focus: { muscleId: string; label: string; share: number }[];
  };
  recovery: {
    readiness: number;
    status: 'ready' | 'recovering' | 'rest';
    headline: string;
    fresh: string[];
    fatigue: Record<string, number>;
  };
  goal: {
    id: number;
    type: string;
    exerciseName?: string;
    targetValue: number;
    current: number;
    percent: number;
    achieved: boolean;
  } | null;
  last14: {
    workouts: number;
    volumeKg: number;
    volumeTrendPct: number | null;
    trendLabel: string;
    sparkline: number[];
    durationMin: number;
    records: number;
    calories: number;
    bodyweight: { kg: number; trendKg: number | null; loggedOn: string } | null;
  };
}

// ── cache ────────────────────────────────────────────────────────────

const CACHE_KEY = 'reprush_home_v1';

function readCache(): Summary | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Summary) : null;
  } catch {
    return null;
  }
}

function useSummary() {
  const [data, setData] = useState<Summary | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await homeApi.summary();
      setData(res.data);
      setError(false);
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(res.data));
      } catch {
        /* quota — the cache is an optimisation, not a requirement */
      }
    } catch {
      // Keep whatever the cache gave us; this is the offline path.
      setError((prev) => prev || !readCache());
    }
  }, []);

  // Read the cache in an effect, not during render, so SSR and the first
  // client pass agree.
  useEffect(() => {
    setData(readCache());
    setReady(true);
    load();
  }, [load]);

  return { data, ready, error, reload: load };
}

// ── small pieces ─────────────────────────────────────────────────────

/**
 * Sparkline as a plain polyline. recharts is already a dependency and draws
 * the real charts on /progress, but a 14-point trend line does not need an
 * axis system — this is a dozen lines and no extra bytes in the Home bundle.
 */
function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const W = 100;
  const H = 28;
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const max = Math.max(...points, 1);
    const step = W / (points.length - 1);
    return points.map((p, i) => `${(i * step).toFixed(1)},${(H - (p / max) * H).toFixed(1)}`).join(' ');
  }, [points]);

  if (!path) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className={cn('h-7 w-full', className)}>
      <polyline
        points={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Vertical readiness gauge beside the Bodygraph. */
function Battery({ value, status }: { value: number; status: Summary['recovery']['status'] }) {
  const tint =
    status === 'ready'
      ? 'hsl(var(--success))'
      : status === 'recovering'
        ? 'hsl(var(--tier-gold))'
        : 'hsl(var(--destructive))';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="relative h-32 w-7 overflow-hidden rounded-md border-2 border-border bg-secondary"
        role="meter"
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Overall readiness"
      >
        <motion.div
          className="absolute inset-x-0 bottom-0"
          style={{ background: tint }}
          initial={{ height: 0 }}
          animate={{ height: `${Math.round(value * 100)}%` }}
          transition={spring.soft}
        />
      </div>
      <span className="nums text-xs font-extrabold">{Math.round(value * 100)}%</span>
    </div>
  );
}

const STATUS_COPY = {
  ready: { label: 'Ready to train', cls: 'border-success/40 bg-success/15 text-success' },
  recovering: { label: 'Recovering', cls: 'border-tier-gold/40 bg-tier-gold/15 text-tier-gold' },
  rest: { label: 'Rest day', cls: 'border-destructive/40 bg-destructive/15 text-destructive' },
} as const;

/**
 * Fatigue → fill. Warm means worked, pale means fresh (SPEC §4).
 * Pure CSS colour interpolation would need a colour space; two stops of the
 * warm token at varying alpha reads correctly in every theme and needs none.
 */
function fatigueColors(fatigue: Record<string, number>): Partial<Record<MuscleId, string>> {
  const out: Partial<Record<MuscleId, string>> = {};
  for (const [id, f] of Object.entries(fatigue)) {
    if (!(id in MUSCLE_BY_ID)) continue;
    out[id as MuscleId] =
      f < 0.05
        ? 'hsl(var(--muted-foreground) / 0.18)'
        : `hsl(var(--warm) / ${(0.18 + f * 0.72).toFixed(2)})`;
  }
  return out;
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
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

// ── goal sheet ───────────────────────────────────────────────────────

function AddGoalSheet({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<'bodyweight' | 'lift'>('bodyweight');
  const [exerciseName, setExerciseName] = useState('Bench Press');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const value = parseFloat(target);
    if (!value || value <= 0) {
      setError('Enter a target above zero.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await goalsApi.create({
        type,
        targetValue: value,
        ...(type === 'lift' ? { exerciseName: exerciseName.trim() } : {}),
      });
      onOpenChange(false);
      setTarget('');
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not save that goal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add a goal"
      description="One number to aim at. You can swap it any time."
      footer={
        <Button variant="chunky" size="cta" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Set goal'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Chip active={type === 'bodyweight'} onClick={() => setType('bodyweight')}>
            Bodyweight
          </Chip>
          <Chip active={type === 'lift'} onClick={() => setType('lift')}>
            A lift
          </Chip>
        </div>

        {type === 'lift' && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-muted-foreground">Exercise</span>
            <input
              value={exerciseName}
              onChange={(e) => setExerciseName(e.target.value)}
              className="w-full rounded-xl border-2 border-border bg-card px-3.5 py-3 font-semibold outline-none focus:border-primary"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-muted-foreground">
            Target {type === 'bodyweight' ? 'bodyweight (kg)' : 'weight (kg)'}
          </span>
          <input
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. 100"
            className="nums w-full rounded-xl border-2 border-border bg-card px-3.5 py-3 text-xl font-extrabold outline-none focus:border-primary"
          />
        </label>

        {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      </div>
    </Sheet>
  );
}

function LogWeightSheet({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const kg = parseFloat(value);
    if (!kg || kg <= 0) {
      setError('Enter a weight above zero.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await bodyWeightApi.log(kg);
      onOpenChange(false);
      setValue('');
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Log bodyweight"
      description="Ranks are strength relative to bodyweight, so keeping this current keeps them honest."
      footer={
        <Button variant="chunky" size="cta" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-muted-foreground">Weight (kg)</span>
        <input
          autoFocus
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 82.5"
          className="nums w-full rounded-xl border-2 border-border bg-card px-3.5 py-3 text-xl font-extrabold outline-none focus:border-primary"
        />
      </label>
      {error && <p className="mt-3 text-sm font-semibold text-destructive">{error}</p>}
    </Sheet>
  );
}

// ── For You ──────────────────────────────────────────────────────────

/** `tab` switches this page's sub-tab; `href` navigates. One or the other. */
const DISCOVER: { label: string; icon: typeof Trophy; tint: string; href?: string; tab?: Tab }[] = [
  { href: '/leaderboard', label: 'Leaderboards', icon: Trophy, tint: 'text-tier-gold' },
  { tab: 'friends', label: 'Social Feeds', icon: Users, tint: 'text-primary' },
  { href: '/progress', label: 'Streak Calendar', icon: CalendarDays, tint: 'text-tier-titan' },
  { href: '/ranks?tab=calc', label: 'Rank Calculator', icon: Calculator, tint: 'text-tier-diamond' },
];

function ForYou({
  data,
  reload,
  onTab,
}: {
  data: Summary;
  reload: () => void;
  onTab: (t: Tab) => void;
}) {
  const router = useRouter();
  const [goalOpen, setGoalOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const { today, recovery, goal, last14 } = data;
  const status = STATUS_COPY[recovery.status];
  const colors = useMemo(() => fatigueColors(recovery.fatigue), [recovery.fatigue]);

  return (
    <>
      {/* 1 — Today's workout */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
        className="mt-4 overflow-hidden rounded-2xl bg-brand-gradient p-5 text-white shadow-glow-brand"
      >
        <span className="inline-flex rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-widest">
          {today.state === 'resume' ? 'In progress' : "Today's workout"}
        </span>
        <div className="mt-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[26px] font-extrabold leading-tight">{today.title}</h2>
            <p className="mt-1 text-sm text-white/85">{today.subtitle}</p>
          </div>
          <Mascot pose={today.state === 'resume' ? 'flex' : 'cheer'} size={64} />
        </div>

        {today.focus.length > 0 && (
          <div className="mt-4 space-y-2">
            {today.focus.map((f) => (
              <div key={f.muscleId}>
                <div className="mb-1 flex justify-between text-xs font-bold">
                  <span>{f.label}</span>
                  <span className="text-white/75">{Math.round(f.share * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
                  <motion.div
                    className="h-full rounded-full bg-white"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(f.share * 100)}%` }}
                    transition={spring.soft}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() =>
            router.push(today.sessionId ? `/workout/session/${today.sessionId}` : '/workout')
          }
          className="press mt-5 h-12 w-full rounded-xl border-b-4 border-b-black/20 bg-white text-sm font-extrabold uppercase tracking-wider text-brand-700 active:translate-y-[3px] active:border-b-[1px]"
        >
          {today.state === 'resume' ? 'Resume session' : 'Start workout'}
        </button>
      </motion.div>

      {/* 2 — Recovery zone */}
      <Section
        title="Recovery Zone"
        action={
          <span className={cn('rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wide', status.cls)}>
            {status.label}
          </span>
        }
      >
        <div className="surface p-4">
          <div className="flex items-center gap-4">
            <BodygraphPair className="h-44 flex-1" colors={colors} interactive={false} />
            <Battery value={recovery.readiness} status={recovery.status} />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{recovery.headline}</p>
        </div>
      </Section>

      {/* 3 — Goal */}
      <Section title="Your Goal">
        {goal ? (
          <div className="surface p-4">
            <div className="flex items-baseline justify-between">
              <p className="font-bold">
                {goal.type === 'lift' ? goal.exerciseName : 'Bodyweight'}
              </p>
              <p className="nums text-sm font-extrabold">
                {goal.current} <span className="text-muted-foreground">/ {goal.targetValue} kg</span>
              </p>
            </div>
            <Bar value={goal.percent / 100} className="mt-3" height={10} label="Goal progress" />
            <p className="mt-2 text-xs text-muted-foreground">
              {goal.achieved ? 'Done — set the next one.' : `${Math.round(goal.percent)}% of the way there.`}
            </p>
          </div>
        ) : (
          <div className="surface p-1">
            <EmptyState
              title="No goal set"
              description="One number to aim at makes the rest of this a lot easier."
              action={
                <Button variant="chunky" size="cta" onClick={() => setGoalOpen(true)}>
                  <Plus size={18} /> Add goal
                </Button>
              }
            />
          </div>
        )}
      </Section>

      {/* 4 — Last 14 workouts */}
      <Section title={`Last ${last14.workouts} Workouts`}>
        <div className="surface p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Volume</p>
              <p className="nums text-4xl font-extrabold leading-none">
                {Math.round(last14.volumeKg).toLocaleString()}
                <span className="ml-1 text-lg font-bold text-muted-foreground">kg</span>
              </p>
            </div>
            <div className="min-w-0 flex-1 text-primary">
              <Sparkline points={last14.sparkline} />
            </div>
          </div>
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-primary">
            {last14.trendLabel}
            {last14.volumeTrendPct !== null && (
              <span className="nums ml-1.5 text-muted-foreground">
                {last14.volumeTrendPct > 0 ? '+' : ''}
                {last14.volumeTrendPct}%
              </span>
            )}
          </p>
        </div>

        <div className="mt-3 flex gap-3">
          <StatTile label="Duration" value={Math.round(last14.durationMin)} unit="min" />
          <StatTile label="Records" value={last14.records} />
          <StatTile label="Calories" value={Math.round(last14.calories).toLocaleString()} sub="estimated" />
        </div>

        <div className="surface mt-3 flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Bodyweight</p>
            <p className="nums text-3xl font-extrabold leading-none">
              {last14.bodyweight ? last14.bodyweight.kg : '—'}
              <span className="ml-1 text-base font-bold text-muted-foreground">kg</span>
            </p>
            {last14.bodyweight?.trendKg != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                {last14.bodyweight.trendKg > 0 ? '+' : ''}
                {last14.bodyweight.trendKg} kg in 14 days
              </p>
            )}
          </div>
          <button
            onClick={() => setWeightOpen(true)}
            aria-label="Log bodyweight"
            className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            <Plus size={20} />
          </button>
          <Link
            href="/progress"
            aria-label="Bodyweight history"
            className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground"
          >
            <ChevronRight size={20} />
          </Link>
        </div>
      </Section>

      {/* 5 — Discover */}
      <Section title="Discover">
        <div className="grid grid-cols-2 gap-3">
          {DISCOVER.map((d) => {
            const Icon = d.icon;
            const inner = (
              <>
                <Icon size={24} className={d.tint} />
                <span className="text-sm font-bold">{d.label}</span>
              </>
            );
            const cls =
              'surface press flex flex-col gap-2 p-4 text-left transition-colors hover:bg-elevated';
            return d.href ? (
              <Link key={d.label} href={d.href} className={cls}>
                {inner}
              </Link>
            ) : (
              <button key={d.label} onClick={() => onTab(d.tab!)} className={cls}>
                {inner}
              </button>
            );
          })}
        </div>
      </Section>

      <AddGoalSheet open={goalOpen} onOpenChange={setGoalOpen} onSaved={reload} />
      <LogWeightSheet open={weightOpen} onOpenChange={setWeightOpen} onSaved={reload} />
    </>
  );
}

// ── page ─────────────────────────────────────────────────────────────

type Tab = 'you' | 'friends' | 'discovery';

export default function HomePage() {
  const { data, ready, error, reload } = useSummary();
  const [tab, setTab] = useState<Tab>('you');

  if (!ready) return null;

  return (
    <div>
      <TabBarLinks
        value={tab}
        onChange={setTab}
        options={[
          { value: 'you', label: 'For You' },
          { value: 'friends', label: 'Friends' },
          { value: 'discovery', label: 'Discovery' },
        ]}
      />

      {tab === 'you' &&
        (data ? (
          <ForYou data={data} reload={reload} onTab={setTab} />
        ) : (
          <EmptyState
            pose={error ? 'sad' : 'idle'}
            title={error ? "Can't reach the server" : 'Setting things up…'}
            description={
              error
                ? 'Your last session is still logged locally. This page will fill in when you are back online.'
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
        ))}

      {tab === 'friends' && (
        <EmptyState
          pose="idle"
          title="No friend activity yet"
          description="When you add friends, their sessions show up here — with the muscles they trained and what they hit."
          action={
            <Link href="/friends">
              <Button variant="chunky" size="cta">
                Find friends
              </Button>
            </Link>
          }
        />
      )}

      {tab === 'discovery' && (
        <EmptyState
          pose="idle"
          title="Nothing in Discovery yet"
          description="Public sessions from lifters across RepRush will land here."
          action={
            <Button variant="chunkyOutline" size="cta" onClick={() => setTab('you')}>
              Back to For You
            </Button>
          }
        />
      )}
    </div>
  );
}

'use client';
/**
 * The post-session chain (SPEC §5.3.1) — the payoff of the whole app.
 *
 * Steps in order: Summary → Ranking → Streak → Progression. Medals and Level Up
 * are P11's, which owns the medal engine and the XP ledger; the chain is built
 * as a list of steps precisely so those drop in without touching the rest.
 *
 * The XP figures shown here are computed from the session on the spot, using
 * SPEC §10's itemised model. They are honest arithmetic over what was logged —
 * but nothing is *awarded* until P11 has a ledger to award into, so the screen
 * says "earned" and not "banked", and there is no claim button to press.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Flame, Share2, Star, Timer, Zap } from 'lucide-react';
import { ranksApi, workoutsApi, homeApi } from '@/lib/api';
import { flushOutbox, materializeSets, resolveSessionId } from '@/lib/offline';
import { rankLabel, rankValue, type Rank } from '@/lib/ranks';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Bar } from '@/components/ui/display';
import { Confetti, Rays } from '@/components/ui/celebration';
import { RankBadge } from '@/components/art/rank-badge';
import { Mascot } from '@/components/art/mascot';
import { hhmmss } from '@/components/workout/rest-timer';

// ── the XP model (SPEC §10) ──────────────────────────────────────────

const XP = { workout: 200, perMinute: 1, perRecord: 10, perStreakDay: 4 };

interface Summary {
  durationSec: number | null;
  totalVolume: number;
  totalSets: number;
  exercises: { name: string; sets: number; topWeight: number; volume: number }[];
  prsHit: { name: string; weightKg: number }[];
}

interface ExerciseRank {
  exerciseId: string;
  name: string;
  rank: Rank;
  sets: number;
}

type StepId = 'summary' | 'ranking' | 'streak' | 'progression';

// ── page ─────────────────────────────────────────────────────────────

export default function SummaryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = resolveSessionId(parseInt(id, 10));

  const [step, setStep] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ranks, setRanks] = useState<ExerciseRank[] | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  // The offline copy is what makes this screen work in a basement: it is the
  // same set list the session screen was rendering a moment ago.
  const localSets = useMemo(() => materializeSets(sessionId).filter((s) => !s.isWarmup), [sessionId]);

  useEffect(() => {
    // Drain first — the summary is a server-side aggregation and it cannot
    // include sets that are still sitting in the outbox.
    flushOutbox()
      .then(() =>
        Promise.all([
          workoutsApi.getSessionSummary(sessionId).catch(() => null),
          ranksApi.exercises().catch(() => null),
          homeApi.summary().catch(() => null),
        ]),
      )
      .then(([s, r, h]) => {
        if (s?.data) setSummary(s.data);
        if (r?.data) setRanks(r.data);
        if (h?.data) setStreak(h.data.user?.streak ?? null);
      })
      .finally(() => setReady(true));
  }, [sessionId]);

  const volume = summary?.totalVolume ?? Math.round(localSets.reduce((n, s) => n + s.weightKg * s.actualReps, 0));
  const setCount = summary?.totalSets ?? localSets.length;
  const durationSec = summary?.durationSec ?? 0;
  const records = summary?.prsHit.length ?? 0;

  const xp = useMemo(() => {
    const minutes = Math.round(durationSec / 60);
    const items = [
      { label: 'Workout', value: XP.workout },
      { label: `Time (${minutes} min)`, value: minutes * XP.perMinute },
      { label: `Records (${records})`, value: records * XP.perRecord },
      { label: `Streak (${streak ?? 0} days)`, value: (streak ?? 0) * XP.perStreakDay },
    ].filter((i) => i.value > 0);
    return { items, total: items.reduce((n, i) => n + i.value, 0) };
  }, [durationSec, records, streak]);

  /** Exercises trained in this session, with the rank they now hold. */
  const trained = useMemo(() => {
    if (!ranks) return [];
    const ids = new Set(localSets.map((s) => s.exerciseId).filter(Boolean));
    const names = new Set(localSets.map((s) => s.exerciseName));
    return ranks
      .filter((r) => ids.has(r.exerciseId) || names.has(r.name))
      .sort((a, b) => rankValue(b.rank) - rankValue(a.rank));
  }, [ranks, localSets]);

  const steps: StepId[] = ['summary', 'ranking', 'streak', 'progression'];
  const advance = useCallback(() => {
    setStep((s) => {
      if (s + 1 < steps.length) return s + 1;
      router.replace('/home');
      return s;
    });
  }, [router, steps.length]);

  if (!ready) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <Mascot pose="cheer" size={110} float />
      </div>
    );
  }

  const current = steps[step];

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -18 }}
          transition={spring.soft}
          className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-5 py-8"
        >
          {current === 'summary' && (
            <StepSummary
              volume={volume}
              sets={setCount}
              durationSec={durationSec}
              records={records}
              xp={xp.total}
            />
          )}
          {current === 'ranking' && <StepRanking trained={trained} />}
          {current === 'streak' && <StepStreak streak={streak ?? 0} />}
          {current === 'progression' && <StepProgression xp={xp} streak={streak ?? 0} />}

          <div className="mt-auto pt-8">
            <Button variant="chunky" size="cta" onClick={advance}>
              {step === steps.length - 1 ? 'Finish' : 'Continue'}
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── 1. Summary ───────────────────────────────────────────────────────

function StepSummary({
  volume, sets, durationSec, records, xp,
}: {
  volume: number;
  sets: number;
  durationSec: number;
  records: number;
  xp: number;
}) {
  const headline = volume > 15000 ? 'Huge Gains!' : volume > 5000 ? 'Strong Work!' : 'Session Logged!';
  return (
    <>
      <Confetti />
      <div className="relative grid place-items-center py-4">
        <Rays color="hsl(var(--primary))" />
        <Mascot pose="cheer" size={128} />
      </div>
      <h1 className="text-center text-4xl font-extrabold">{headline}</h1>
      <p className="nums mt-1 text-center text-muted-foreground">
        {sets} sets · {volume.toLocaleString()} kg moved
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatCard label="Duration" value={hhmmss(durationSec).replace(/^00:/, '')} icon={<Timer size={18} />} tone="purple" />
        <StatCard label="Records" value={String(records)} icon={<Star size={18} />} tone="gold" />
        <StatCard label="XP" value={`+${xp}`} icon={<Zap size={18} />} tone="blue" />
      </div>
    </>
  );
}

const TONES = {
  purple: 'bg-tier-diamond/15 text-tier-diamond',
  gold: 'bg-tier-gold/15 text-tier-gold',
  blue: 'bg-primary/15 text-primary',
} as const;

function StatCard({
  label, value, icon, tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: keyof typeof TONES;
}) {
  return (
    <div className={cn('rounded-2xl p-4 text-center', TONES[tone])}>
      <span className="grid place-items-center">{icon}</span>
      <p className="nums mt-1.5 text-xl font-extrabold leading-none">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}

// ── 2. Ranking ───────────────────────────────────────────────────────

function StepRanking({ trained }: { trained: ExerciseRank[] }) {
  return (
    <>
      <h1 className="text-center text-3xl font-extrabold">Ranking</h1>
      <p className="mt-1 text-center text-muted-foreground">Where today put you on each lift.</p>

      {!trained.length && (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Nothing ranked this session — sets need a catalog exercise to score.
        </p>
      )}

      <ul className="mt-6 space-y-2.5">
        {trained.map((r, i) => (
          <motion.li
            key={r.exerciseId}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i, ...spring.soft }}
            className="surface flex items-center gap-3 p-3"
          >
            <RankBadge
              tier={r.rank.tier}
              division={r.rank.division}
              size="md"
              animated={false}
              showDivision={false}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{r.name}</p>
              <Bar value={r.rank.lp / 100} className="mt-1.5" height={6} label="Rank progress" />
            </div>
            <p
              className="nums shrink-0 text-sm font-extrabold"
              style={{ color: `hsl(var(--tier-${r.rank.tier}))` }}
            >
              {rankLabel(r.rank)}
            </p>
          </motion.li>
        ))}
      </ul>
    </>
  );
}

// ── 3. Streak ────────────────────────────────────────────────────────

function StepStreak({ streak }: { streak: number }) {
  return (
    <div className="grid flex-1 place-items-center text-center">
      <div>
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.bouncy}
          className="flex items-center justify-center gap-3"
        >
          <span className="nums text-[88px] font-extrabold leading-none">{streak}</span>
          <Flame size={64} className="text-warm" />
        </motion.div>
        <p className="mt-2 text-2xl font-bold">workout streak!</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {streak > 1 ? 'Keep it alive — train again tomorrow.' : 'Day one. Come back tomorrow to build it.'}
        </p>
      </div>
    </div>
  );
}

// ── 4. Progression ───────────────────────────────────────────────────

function StepProgression({
  xp, streak,
}: {
  xp: { items: { label: string; value: number }[]; total: number };
  streak: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="grid place-items-center py-2">
        <Mascot pose="flex" size={104} />
      </div>
      <h1 className="text-center text-3xl font-extrabold">Your Progression</h1>

      <div className="mt-5 flex justify-center gap-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-full',
              i < Math.min(streak, 7) ? 'bg-warm/20 text-warm' : 'bg-secondary text-muted-foreground/40',
            )}
          >
            <Flame size={17} />
          </span>
        ))}
      </div>

      <div className="surface mt-6 p-4">
        <div className="flex items-baseline justify-between">
          <p className="font-bold">XP earned</p>
          <p className="nums text-2xl font-extrabold text-primary">+{xp.total}</p>
        </div>
        <Bar value={Math.min(1, xp.total / 1000)} className="mt-3" height={10} label="XP earned" />
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 text-sm font-bold text-muted-foreground"
        >
          {open ? 'Hide XP breakdown ⌃' : 'Show XP breakdown ⌄'}
        </button>
        <AnimatePresence>
          {open && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              {xp.items.map((i) => (
                <li key={i.label} className="nums flex justify-between border-t border-border py-2 text-sm">
                  <span className="text-muted-foreground">{i.label}</span>
                  <span className="font-extrabold">+{i.value}</span>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
        <p className="mt-3 text-xs text-muted-foreground">
          Levels, currency and medals land with the rewards ledger — this is what today was worth.
        </p>
      </div>
    </>
  );
}

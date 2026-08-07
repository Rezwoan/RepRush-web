'use client';
/**
 * Workout tab — the Builder (SPEC §5.1).
 *
 * Everything on this screen is a *proposal*. Nothing is written until Start
 * Workout, which is why generation is a GET and the edits below are local
 * state: someone shuffling chips for two minutes should not leave a trail of
 * abandoned sessions behind them.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ChevronDown, GripVertical, MoreVertical, Play, Plus, RefreshCw, Repeat, Trash2, X,
} from 'lucide-react';
import { workoutsApi, ranksApi } from '@/lib/api';
import { queueStartSession, flushOutbox, resolveSessionId } from '@/lib/offline';
import { MUSCLE_BY_ID, type MuscleId } from '@/lib/muscles';
import { spring } from '@/lib/motion';
import { useUnits } from '@/lib/units';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/display';
import { Sheet } from '@/components/ui/sheet';
import { Bodygraph } from '@/components/art/bodygraph';
import {
  ExercisePicker,
  Thumb,
  useCatalog,
  type CatalogExercise,
  type PickerContext,
} from '@/components/workout/exercise-picker';

// ── types (mirrors backend/src/workouts/generator.ts) ────────────────

interface PlannedSet {
  setNumber: number;
  isWarmup: boolean;
  targetReps: number;
  weightKg: number | null;
}

interface PlannedExercise {
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  mechanic: 'compound' | 'isolation' | null;
  restSec: number;
  sets: PlannedSet[];
  fromHistory: boolean;
}

export interface GeneratedWorkout {
  title: string;
  durationMin: number;
  estimatedSec: number;
  focus: { muscleId: string; label: string; share: number }[];
  exercises: PlannedExercise[];
}

const DURATIONS = [30, 45, 60, 90];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
const REST_PRESETS = [60, 90, 120, 180];

const fmtRest = (s: number) => (s % 60 === 0 ? `${s / 60}m` : `${Math.floor(s / 60)}m ${s % 60}s`);

// ── target-muscle card ───────────────────────────────────────────────

/**
 * A mini Bodygraph with one muscle lit, and its share of the session.
 * The same component the Recovery Zone uses, at card size — one drawing of the
 * body across the app, not three.
 */
function TargetMuscle({ muscleId, label, share }: { muscleId: string; label: string; share: number }) {
  const m = MUSCLE_BY_ID[muscleId as MuscleId];
  const view = m?.view === 'back' ? 'back' : 'front';
  return (
    <div className="surface flex w-[104px] shrink-0 flex-col items-center gap-1 p-2.5">
      <Bodygraph
        view={view}
        className="h-20"
        interactive={false}
        colors={{ [muscleId as MuscleId]: 'hsl(var(--primary))' }}
      />
      <p className="w-full truncate text-center text-xs font-bold">{label}</p>
      <p className="nums text-[11px] font-extrabold text-primary">{Math.round(share * 100)}%</p>
    </div>
  );
}

// ── exercise row ─────────────────────────────────────────────────────

function ExerciseRow({
  ex,
  catalog,
  onSwap,
  onRemove,
  onMove,
  onRest,
  first,
  last,
}: {
  ex: PlannedExercise;
  catalog: Record<string, CatalogExercise>;
  onSwap: () => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  onRest: () => void;
  first: boolean;
  last: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const u = useUnits();
  const working = ex.sets.filter((s) => !s.isWarmup);
  const top = working[0];
  const cat = catalog[ex.exerciseId];

  return (
    <li className="surface flex items-center gap-3 p-3">
      {cat ? (
        <Thumb ex={cat} />
      ) : (
        <span className="h-11 w-11 shrink-0 rounded-xl border border-border bg-secondary" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">
          <span className="nums text-primary">{working.length} × </span>
          {ex.name}
        </p>
        <p className="nums text-sm text-muted-foreground">
          {top?.weightKg != null && top.weightKg > 0 ? `${u.weight(top.weightKg)} · ` : ''}
          {top?.targetReps ?? '—'} reps
          <span className="mx-1.5 opacity-40">|</span>
          {fmtRest(ex.restSec)} rest
          {!ex.fromHistory && <span className="ml-1.5 text-[11px] uppercase tracking-wide">estimated</span>}
        </p>
      </div>

      <button
        onClick={() => setMenu(true)}
        aria-label={`Options for ${ex.name}`}
        className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
      >
        <MoreVertical size={18} />
      </button>

      <Sheet open={menu} onOpenChange={setMenu} title={ex.name}>
        <div className="space-y-2 pb-2">
          <MenuItem icon={<Repeat size={18} />} label="Swap exercise" onClick={() => { setMenu(false); onSwap(); }} />
          <MenuItem icon={<RefreshCw size={18} />} label={`Rest — ${fmtRest(ex.restSec)}`} onClick={() => { setMenu(false); onRest(); }} />
          <MenuItem
            icon={<GripVertical size={18} />}
            label="Move up"
            disabled={first}
            onClick={() => { setMenu(false); onMove(-1); }}
          />
          <MenuItem
            icon={<GripVertical size={18} />}
            label="Move down"
            disabled={last}
            onClick={() => { setMenu(false); onMove(1); }}
          />
          <MenuItem
            icon={<Trash2 size={18} />}
            label="Remove"
            tone="danger"
            onClick={() => { setMenu(false); onRemove(); }}
          />
        </div>
      </Sheet>
    </li>
  );
}

function MenuItem({
  icon, label, onClick, disabled, tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'press flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left font-bold',
        'disabled:opacity-40',
        tone === 'danger' && 'text-destructive',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ── page ─────────────────────────────────────────────────────────────

export default function WorkoutBuilderPage() {
  const router = useRouter();
  const { byId } = useCatalog();

  const [durationMin, setDurationMin] = useState(60);
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number] | null>(null);
  const [plan, setPlan] = useState<GeneratedWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ranks, setRanks] = useState<PickerContext['ranks']>();

  // Picker state: null = closed, otherwise the index being swapped (-1 = append).
  const [picking, setPicking] = useState<number | null>(null);
  const [restFor, setRestFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await workoutsApi.generate({
        durationMin,
        difficulty: difficulty ?? undefined,
      });
      setPlan(r.data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [durationMin, difficulty]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    ranksApi
      .exercises()
      .then((r) =>
        setRanks(
          Object.fromEntries(
            (r.data ?? []).map((e: any) => [e.exerciseId, { rank: e.rank, sets: e.sets }]),
          ),
        ),
      )
      .catch(() => {});
  }, []);

  /** Turn a catalog entry into a planned exercise, reusing the plan's shape. */
  const planFor = useCallback(
    (cat: CatalogExercise, like?: PlannedExercise): PlannedExercise => {
      const sets = like?.sets.length ?? 3;
      const reps = Math.round((cat.repMin + cat.repMax) / 2);
      return {
        exerciseId: cat.id,
        name: cat.name,
        primaryMuscle: cat.primary[0],
        equipment: cat.equipment,
        mechanic: cat.mechanic,
        restSec: cat.restSec,
        // A hand-picked exercise has no history loaded here, so it starts blank
        // rather than inheriting the numbers of the lift it replaced — those
        // belong to a different movement.
        sets: Array.from({ length: sets }, (_, i) => ({
          setNumber: i + 1,
          isWarmup: false,
          targetReps: reps,
          weightKg: null,
        })),
        fromHistory: false,
      };
    },
    [],
  );

  const mutate = (fn: (list: PlannedExercise[]) => PlannedExercise[]) =>
    setPlan((p) => (p ? { ...p, exercises: fn(p.exercises) } : p));

  const start = async () => {
    if (!plan?.exercises.length || starting) return;
    setStarting(true);
    // Always through the outbox — a session started on gym wifi that half
    // works must not lose the first three sets while an axios call retries.
    const tempId = queueStartSession(plan.title, undefined, plan);
    void flushOutbox();
    // Give the flush a moment to swap in the real id, but never block on it.
    setTimeout(() => router.push(`/workout/session/${resolveSessionId(tempId)}`), 350);
  };

  const totalSets = useMemo(
    () => plan?.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.isWarmup).length, 0) ?? 0,
    [plan],
  );

  return (
    <div className="pb-28">
      {/* Filter chips */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 pt-1">
        {DURATIONS.map((d) => (
          <Chip key={d} active={durationMin === d} onClick={() => setDurationMin(d)}>
            {d >= 60 && d % 60 === 0 ? `${d / 60}h` : `${d}m`}
          </Chip>
        ))}
        <span className="w-px shrink-0 self-stretch bg-border" />
        {DIFFICULTIES.map((d) => (
          <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(difficulty === d ? null : d)}>
            <span className="capitalize">{d}</span>
          </Chip>
        ))}
        <Chip onClick={() => void load()}>
          <RefreshCw size={14} /> Regenerate
        </Chip>
      </div>

      {loading && !plan && (
        <p className="py-16 text-center text-sm text-muted-foreground">Building your session…</p>
      )}

      {error && !plan && (
        <EmptyState
          pose="sad"
          title="Couldn't build a session"
          description="The generator needs the server. Your logged sets are safe — try again when you're back online."
          action={
            <Button variant="chunkyOutline" size="cta" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      )}

      {plan && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.soft}
            className="mt-4"
          >
            <h1 className="text-[26px] font-extrabold leading-tight">{plan.title}</h1>
            <p className="nums mt-0.5 text-sm text-muted-foreground">
              {plan.exercises.length} exercises · {totalSets} sets · about{' '}
              {Math.max(1, Math.round(plan.estimatedSec / 60))} min
            </p>
          </motion.div>

          {plan.focus.length > 0 && (
            <section className="mt-5">
              <h2 className="mb-2.5 text-[22px] font-bold">Target Muscles</h2>
              <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
                {plan.focus.map((f) => (
                  <TargetMuscle key={f.muscleId} {...f} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-6">
            <h2 className="mb-2.5 text-[22px] font-bold">{plan.exercises.length} Exercises</h2>
            <ul className="space-y-2.5">
              {plan.exercises.map((ex, i) => (
                <ExerciseRow
                  key={ex.exerciseId}
                  ex={ex}
                  catalog={byId}
                  first={i === 0}
                  last={i === plan.exercises.length - 1}
                  onSwap={() => setPicking(i)}
                  onRest={() => setRestFor(i)}
                  onRemove={() => mutate((l) => l.filter((_, j) => j !== i))}
                  onMove={(delta) =>
                    mutate((l) => {
                      const next = [...l];
                      const j = i + delta;
                      if (j < 0 || j >= next.length) return next;
                      [next[i], next[j]] = [next[j], next[i]];
                      return next;
                    })
                  }
                />
              ))}
            </ul>

            <button
              onClick={() => setPicking(-1)}
              className="press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-3.5 font-bold text-muted-foreground"
            >
              <Plus size={18} /> Add exercise
            </button>
          </section>
        </>
      )}

      {/* Floating start button */}
      {plan && plan.exercises.length > 0 && (
        <div className="fixed inset-x-0 bottom-[72px] z-40 mx-auto max-w-2xl px-4 pb-3">
          <Button variant="chunky" size="cta" disabled={starting} onClick={start}>
            <Play size={18} fill="currentColor" />
            {starting ? 'Starting…' : 'Start Workout'}
          </Button>
        </div>
      )}

      <ExercisePicker
        open={picking !== null}
        onOpenChange={(v) => !v && setPicking(null)}
        context={{ ranks }}
        muscle={picking != null && picking >= 0 ? plan?.exercises[picking]?.primaryMuscle : undefined}
        excludeIds={plan?.exercises.map((e) => e.exerciseId) ?? []}
        onPick={(cat) => {
          const at = picking;
          setPicking(null);
          mutate((l) =>
            at != null && at >= 0
              ? l.map((e, j) => (j === at ? planFor(cat, e) : e))
              : [...l, planFor(cat)],
          );
        }}
      />

      <Sheet
        open={restFor !== null}
        onOpenChange={(v) => !v && setRestFor(null)}
        title="Rest between sets"
        description="Applies to this exercise for the whole session."
      >
        <div className="grid grid-cols-2 gap-2.5 pb-2">
          {REST_PRESETS.map((s) => (
            <Button
              key={s}
              variant="chunkyOutline"
              onClick={() => {
                const at = restFor;
                setRestFor(null);
                mutate((l) => l.map((e, j) => (j === at ? { ...e, restSec: s } : e)));
              }}
            >
              {fmtRest(s)}
            </Button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

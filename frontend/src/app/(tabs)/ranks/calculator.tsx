'use client';
/**
 * Rank Calculator — SPEC §6. The standalone tool, also linked from Home's
 * Discover grid.
 *
 * `Save Rank` is the part that matters: ranks are a pure function of
 * `workout_sets`, so the only honest way to "keep" a calculated rank is to log
 * the lift. That is what `POST /ranks/record` does, and it is the same call
 * onboarding makes for the first lift.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ranksApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { rankLabel, type Rank } from '@/lib/ranks';
import { useUnits } from '@/lib/units';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/controls';
import { Bar } from '@/components/ui/display';
import { RulerPicker } from '@/components/ui/pickers';
import { RankBadge } from '@/components/art/rank-badge';
import { ExercisePicker, Thumb, useCatalog, type CatalogExercise } from '@/components/workout/exercise-picker';
import { tierColor } from './types';

/** The lifts most people reach for first — the `‹ ›` carousel's starting set. */
const FEATURED = [
  'Barbell_Bench_Press_-_Medium_Grip',
  'Barbell_Squat',
  'Barbell_Deadlift',
  'Standing_Military_Press',
  'Bent_Over_Barbell_Row',
  'Barbell_Curl',
  'Wide-Grip_Lat_Pulldown',
  'Leg_Press',
];

const HISTORY_KEY = 'reprush_calc_history_v1';
const HISTORY_MAX = 12;

interface Entry {
  at: number;
  exerciseId: string;
  name: string;
  weightKg: number;
  reps: number;
  rank: Rank;
  saved: boolean;
}

function readHistory(): Entry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as Entry[];
  } catch {
    return [];
  }
}

export function CalculatorPanel({ onSaved }: { onSaved: () => void }) {
  // `weight` stays in kg — the picker is what changes units, not the state.
  const u = useUnits();
  const { user } = useAuth();
  const { list, byId } = useCatalog();
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [weight, setWeight] = useState(60);
  const [reps, setReps] = useState(5);
  // 60 kg is a round default; 132.3 lb is not, and the ruler would snap the
  // tick while the result card kept the unsnapped number. Land on a plate.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && u.imperial) setWeight(u.wkg(135));
  }, [u.imperial, touched]);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ rank: Rank; e1rm: number } | null>(null);
  const [history, setHistory] = useState<Entry[]>([]);

  // localStorage in an effect, not during render, so SSR and hydration agree.
  useEffect(() => setHistory(readHistory()), []);

  const carousel = useMemo(
    () => FEATURED.map((id) => byId[id]).filter(Boolean) as CatalogExercise[],
    [byId],
  );
  const exercise: CatalogExercise | undefined = picked ? byId[picked] : carousel[idx];

  const age = user?.birthDate
    ? Math.floor((Date.now() - new Date(user.birthDate).getTime()) / (365.25 * 86400000))
    : undefined;

  const step = (dir: 1 | -1) => {
    setPicked(null);
    setResult(null);
    setIdx((i) => (i + dir + carousel.length) % Math.max(1, carousel.length));
  };

  const calculate = async () => {
    if (!exercise) return;
    setBusy(true);
    setError('');
    try {
      const res = await ranksApi.calculate({
        exerciseId: exercise.id,
        weightKg: weight,
        reps,
        bodyweightKg: user?.weightKg ?? 0,
        sex: user?.sex ?? undefined,
        age,
      });
      const rank: Rank = res.data.rank;
      if (save) {
        await ranksApi.record({ exerciseId: exercise.id, weightKg: weight, reps });
        onSaved();
      }
      setResult({ rank, e1rm: res.data.e1rm });

      const entry: Entry = {
        at: Date.now(),
        exerciseId: exercise.id,
        name: exercise.name,
        weightKg: weight,
        reps,
        rank,
        saved: save,
      };
      const next = [entry, ...history].slice(0, HISTORY_MAX);
      setHistory(next);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* quota — the history is a convenience, not a record */
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not work that out. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      {/* Exercise carousel */}
      <div className="surface p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => step(-1)}
            aria-label="Previous exercise"
            disabled={!carousel.length}
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground disabled:opacity-40"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            {exercise ? (
              <>
                <Thumb ex={exercise} size={72} />
                <p className="line-clamp-2 text-sm font-bold leading-tight">{exercise.name}</p>
              </>
            ) : (
              <p className="py-6 text-sm text-muted-foreground">Loading exercises…</p>
            )}
          </div>
          <button
            onClick={() => step(1)}
            aria-label="Next exercise"
            disabled={!carousel.length}
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground disabled:opacity-40"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <button
          onClick={() => setPickerOpen(true)}
          className="press mt-3 flex w-full items-center gap-2 rounded-xl border-2 border-border bg-secondary px-3.5 py-2.5 text-sm font-semibold text-muted-foreground"
        >
          <Search size={16} /> Search for another exercise…
        </button>
      </div>

      <div className="surface mt-3 space-y-4 p-4">
        <RulerPicker
          label="Weight"
          value={u.wv(weight, 1)}
          onChange={(v) => {
            setTouched(true);
            setWeight(u.wkg(v));
            setResult(null);
          }}
          min={0}
          max={u.imperial ? 660 : 300}
          step={u.step}
          unit={u.w}
          major={4}
        />
        <RulerPicker
          label="Reps"
          value={reps}
          onChange={(v) => {
            setReps(v);
            setResult(null);
          }}
          min={1}
          max={30}
          step={1}
          unit="reps"
        />
      </div>

      <div className="surface mt-3 flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="font-bold">Save rank</p>
          <p className="text-xs text-muted-foreground">
            Logs it as a real set, so it counts towards your Bodyrank and placements.
          </p>
        </div>
        <Toggle checked={save} onChange={setSave} label="Save rank" />
      </div>

      {error && <p className="mt-3 text-sm font-semibold text-destructive">{error}</p>}

      <Button
        variant="chunky"
        size="cta"
        className="mt-3 w-full"
        disabled={busy || !exercise || weight <= 0 || reps <= 0}
        onClick={calculate}
      >
        {busy ? 'Working it out…' : 'Get my rank!'}
      </Button>

      {result && (
        <div
          className="surface mt-4 flex flex-col items-center gap-2 p-5"
          style={{ background: `color-mix(in srgb, ${tierColor(result.rank)} 12%, transparent)` }}
        >
          <RankBadge tier={result.rank.tier} division={result.rank.division} size="xl" entrance />
          <p className="text-2xl font-extrabold" style={{ color: tierColor(result.rank) }}>
            {rankLabel(result.rank)}
          </p>
          <p className="text-sm text-muted-foreground">
            Stronger than {Math.round(result.rank.percentile)}% of lifters · est. 1RM{' '}
            {u.weight(result.e1rm, 0)}
          </p>
          <Bar
            value={result.rank.lp / 100}
            color={tierColor(result.rank)}
            className="mt-1 w-full"
            height={10}
            label="LP in this division"
          />
        </div>
      )}

      {history.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2.5 text-[22px] font-bold">Calculator History</h2>
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.at} className="surface flex items-center gap-3 p-3">
                <RankBadge
                  tier={h.rank.tier}
                  division={h.rank.division}
                  size="sm"
                  animated={false}
                  showDivision={false}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{h.name}</p>
                  <p className="nums text-xs text-muted-foreground">
                    {u.weight(h.weightKg)} × {h.reps}
                    {h.saved && <span className="ml-1.5 font-extrabold text-success">SAVED</span>}
                  </p>
                </div>
                <span
                  className={cn('shrink-0 text-sm font-extrabold')}
                  style={{ color: tierColor(h.rank) }}
                >
                  {rankLabel(h.rank)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ExercisePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(ex) => {
          setPicked(ex.id);
          setResult(null);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

'use client';
/**
 * The routine editor.
 *
 * A routine exercise is an **array of set rows**, each with its own weight and
 * reps — not a set count plus one shared rep range, which is what the first
 * version of this screen stored and which cannot express a top set of 3 under
 * two back-offs of 8. The grid is the same `SET | PREV | KG | REPS` the session
 * tracker uses, on purpose: what you write here is what you will see there.
 *
 * Blank is a real value. A row with no numbers means "whatever I did last
 * time", and the tracker fills it from history — the v1 ghost rule, a lookup
 * and never a projection. So the fields are placeholders showing PREV, not
 * pre-filled numbers pretending to be a plan.
 */
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Minus, Plus, Trash2 } from 'lucide-react';
import { profileApi, workoutsApi } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { ExercisePicker, Thumb, useCatalog } from '@/components/workout/exercise-picker';
import { Panel } from './panel';

export interface RoutineSet {
  weightKg: number | null;
  reps: number | null;
}

export interface RoutineExercise {
  exerciseId: string;
  name: string;
  notes: string | null;
  restSec: number;
  sets: RoutineSet[];
}

export interface EditableRoutine {
  id?: number;
  name: string;
  folderId: number | null;
  exercises: RoutineExercise[];
}

const REST_PRESETS = [30, 45, 60, 90, 120, 150, 180, 240, 300];

const fmtRest = (s: number) =>
  s >= 60 ? `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ''}` : `${s}s`;

/** Fills anything a legacy row is missing, so an old routine opens whole. */
export const withDefaults = (e: any): RoutineExercise => ({
  exerciseId: e.exerciseId,
  name: e.name ?? e.exerciseId,
  notes: e.notes ?? null,
  restSec: Number.isFinite(Number(e.restSec)) ? Number(e.restSec) : 90,
  sets: Array.isArray(e.sets)
    ? e.sets.map((s: any) => ({
        weightKg: s?.weightKg ?? null,
        reps: s?.reps ?? null,
      }))
    : // The shape this screen used to write: a count plus a rep range.
      Array.from({ length: Number(e.sets) || 3 }, () => ({
        weightKg: null,
        reps: Math.round(((Number(e.repMin) || 8) + (Number(e.repMax) || 12)) / 2),
      })),
});

/**
 * A routine exercise in one line: "3 × 8", or "3 sets" when the rows carry no
 * numbers, or the distinct reps when they differ ("8 · 5 · 3") — which is the
 * whole point of per-set rows and would be invisible under a single average.
 */
export function setSummary(ex: RoutineExercise): string {
  const n = ex.sets.length;
  const reps = ex.sets.map((s) => s.reps);
  if (reps.every((r) => r === null)) return `${n} set${n === 1 ? '' : 's'}`;
  const shown = reps.map((r) => r ?? '—');
  return new Set(shown).size === 1 ? `${n} × ${shown[0]}` : shown.join(' · ');
}

type Prev = Record<string, { weightKg: number | null; reps: number | null }[]>;

/** One editable cell. Empty means "not prescribed" and shows PREV behind it. */
function Cell({
  value,
  placeholder,
  onChange,
  label,
  step,
}: {
  value: number | null;
  placeholder: string;
  onChange: (v: number | null) => void;
  label: string;
  step?: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={0}
      value={value ?? ''}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return onChange(null);
        const n = Number(raw);
        onChange(Number.isFinite(n) && n >= 0 ? n : null);
      }}
      className="nums w-full rounded-lg border-2 border-border bg-card px-1 py-2 text-center font-bold outline-none placeholder:font-semibold placeholder:text-muted-foreground/60 focus:border-primary"
    />
  );
}

function ExerciseCard({
  ex,
  index,
  total,
  prev,
  units,
  onPatch,
  onMove,
  onRemove,
}: {
  ex: RoutineExercise;
  index: number;
  total: number;
  prev?: { weightKg: number | null; reps: number | null }[];
  units: ReturnType<typeof useUnits>;
  onPatch: (p: Partial<RoutineExercise>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const { byId } = useCatalog();
  const [restOpen, setRestOpen] = useState(false);
  const cat = byId?.[ex.exerciseId];

  const patchSet = (i: number, p: Partial<RoutineSet>) =>
    onPatch({ sets: ex.sets.map((s, j) => (j === i ? { ...s, ...p } : s)) });

  return (
    <li className="surface p-3">
      <div className="flex items-center gap-2.5">
        {cat && <Thumb ex={cat} size={40} />}
        <p className="min-w-0 flex-1 truncate font-bold">{cat?.name ?? ex.name}</p>
        <button
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label={`Move ${ex.name} up`}
          className="press grid h-7 w-7 place-items-center rounded-lg text-muted-foreground disabled:opacity-30"
        >
          <ChevronUp size={16} />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label={`Move ${ex.name} down`}
          className="press grid h-7 w-7 place-items-center rounded-lg text-muted-foreground disabled:opacity-30"
        >
          <ChevronDown size={16} />
        </button>
        <button
          onClick={onRemove}
          aria-label={`Remove ${ex.name}`}
          className="press grid h-7 w-7 place-items-center rounded-lg text-muted-foreground"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <textarea
        value={ex.notes ?? ''}
        onChange={(e) => onPatch({ notes: e.target.value })}
        placeholder="Add exercise notes…"
        aria-label={`Notes for ${ex.name}`}
        rows={1}
        className="mt-2.5 w-full resize-y rounded-xl border-2 border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
      />

      <div className="mt-3">
        <div className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] items-center gap-1.5 px-0.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>Set</span>
          <span className="text-center">Prev</span>
          <span className="text-center">{units.w}</span>
          <span className="text-center">Reps</span>
          <span />
        </div>

        <ul className="space-y-1.5">
          {ex.sets.map((s, i) => {
            const p = prev?.[i];
            return (
              <li
                key={i}
                className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] items-center gap-1.5"
              >
                <span className="nums grid h-9 place-items-center rounded-lg bg-secondary text-sm font-extrabold">
                  {i + 1}
                </span>
                <span className="nums grid h-9 place-items-center rounded-lg bg-muted/50 px-1 text-xs text-muted-foreground">
                  {p && p.reps ? `${units.n(p.weightKg ?? 0, 1)} × ${p.reps}` : '—'}
                </span>
                <Cell
                  value={s.weightKg === null ? null : units.wv(s.weightKg)}
                  placeholder={p?.weightKg != null ? String(units.wv(p.weightKg)) : '—'}
                  step={String(units.step)}
                  label={`Set ${i + 1} weight on ${ex.name}`}
                  onChange={(v) => patchSet(i, { weightKg: v === null ? null : units.wkg(v) })}
                />
                <Cell
                  value={s.reps}
                  placeholder={p?.reps != null ? String(p.reps) : '—'}
                  label={`Set ${i + 1} reps on ${ex.name}`}
                  onChange={(v) => patchSet(i, { reps: v === null ? null : Math.round(v) })}
                />
                <button
                  onClick={() => onPatch({ sets: ex.sets.filter((_, j) => j !== i) })}
                  disabled={ex.sets.length === 1}
                  aria-label={`Remove set ${i + 1} from ${ex.name}`}
                  className="press grid h-7 w-7 place-items-center rounded-full bg-destructive text-destructive-foreground disabled:opacity-30"
                >
                  <Minus size={14} />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-2 flex gap-2">
          <button
            onClick={() =>
              onPatch({
                // A new row copies the one above it — adding a fourth set of the
                // same thing is the common case, and retyping it is not editing.
                sets: [...ex.sets, { ...(ex.sets[ex.sets.length - 1] ?? { weightKg: null, reps: null }) }],
              })
            }
            className="press flex-1 rounded-xl border-2 border-dashed border-border py-2 text-sm font-bold text-muted-foreground"
          >
            Add set
          </button>
          <button
            onClick={() => setRestOpen(true)}
            className="press rounded-xl border-2 border-border px-3 py-2 text-sm font-bold text-muted-foreground"
          >
            Rest {fmtRest(ex.restSec)}
          </button>
        </div>
      </div>

      <Sheet open={restOpen} onOpenChange={setRestOpen} title={`Rest — ${ex.name}`}>
        <div className="grid grid-cols-3 gap-2 pb-2">
          {REST_PRESETS.map((r) => (
            <Button
              key={r}
              variant={r === ex.restSec ? 'chunky' : 'chunkyOutline'}
              onClick={() => {
                onPatch({ restSec: r });
                setRestOpen(false);
              }}
            >
              {fmtRest(r)}
            </Button>
          ))}
        </div>
      </Sheet>
    </li>
  );
}

export function RoutineEditor({
  initial,
  folders,
  onBack,
  onSaved,
}: {
  initial: EditableRoutine;
  folders: { id: number; name: string }[];
  onBack: () => void;
  onSaved: (library: any) => void;
}) {
  const units = useUnits();
  const [routine, setRoutine] = useState<EditableRoutine>(initial);
  const [prev, setPrev] = useState<Prev>({});
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /**
   * Last session's actual sets, per exercise — the PREV column, and the answer
   * to "why do you assume 3 sets": a newly added exercise starts with as many
   * rows as the user did last time, not a hardcoded three.
   */
  const loadPrev = useCallback(async (exerciseId: string) => {
    const res = await workoutsApi.getPrevious(exerciseId).catch(() => null);
    const sets = res?.data?.sets ?? [];
    setPrev((p) => ({ ...p, [exerciseId]: sets }));
    return sets as { weightKg: number | null; reps: number | null }[];
  }, []);

  useEffect(() => {
    for (const e of initial.exercises) void loadPrev(e.exerciseId);
  }, [initial.exercises, loadPrev]);

  const mutate = (fn: (l: RoutineExercise[]) => RoutineExercise[]) =>
    setRoutine((r) => ({ ...r, exercises: fn(r.exercises) }));

  const save = async () => {
    if (!routine.name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await profileApi.saveRoutine(routine as any);
      onSaved(res.data);
      onBack();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not save that routine.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title={routine.id ? 'Edit routine' : 'New routine'} onBack={onBack}>
      <div className="space-y-4 pb-28">
        <div>
          <label htmlFor="routine-name" className="mb-1.5 block font-extrabold">
            Routine name
          </label>
          <input
            id="routine-name"
            value={routine.name}
            onChange={(e) => setRoutine({ ...routine, name: e.target.value })}
            placeholder="Upper"
            className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
          />
        </div>

        {folders.length > 0 && (
          <select
            value={routine.folderId ?? ''}
            aria-label="Folder"
            onChange={(e) =>
              setRoutine({
                ...routine,
                folderId: e.target.value ? parseInt(e.target.value, 10) : null,
              })
            }
            className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none"
          >
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}

        {error && <p className="text-sm font-bold text-destructive">{error}</p>}

        <div>
          <h2 className="mb-2 font-extrabold">Workout content</h2>
          <ul className="space-y-2.5">
            {routine.exercises.map((ex, i) => (
              <ExerciseCard
                key={`${ex.exerciseId}-${i}`}
                ex={ex}
                index={i}
                total={routine.exercises.length}
                prev={prev[ex.exerciseId]}
                units={units}
                onPatch={(p) => mutate((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)))}
                onMove={(d) =>
                  mutate((l) => {
                    const next = [...l];
                    const j = i + d;
                    if (j < 0 || j >= next.length) return next;
                    [next[i], next[j]] = [next[j], next[i]];
                    return next;
                  })
                }
                onRemove={() => mutate((l) => l.filter((_, j) => j !== i))}
              />
            ))}
          </ul>

          {routine.exercises.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing in this routine yet.
            </p>
          )}

          <button
            onClick={() => setPicking(true)}
            className="press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-3.5 font-bold text-muted-foreground"
          >
            <Plus size={18} /> Exercise
          </button>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl px-4 pb-3 safe-bottom">
        <Button
          variant="chunky"
          size="cta"
          className="w-full"
          disabled={!routine.name.trim() || saving}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save routine'}
        </Button>
      </div>

      <ExercisePicker
        open={picking}
        onOpenChange={setPicking}
        excludeIds={routine.exercises.map((e) => e.exerciseId)}
        onPick={async (cat) => {
          setPicking(false);
          const last = await loadPrev(cat.id);
          mutate((l) => [
            ...l,
            {
              exerciseId: cat.id,
              name: cat.name,
              notes: null,
              restSec: cat.restSec,
              // As many rows as they did last time, blank so PREV shows through.
              // Three only when there is no history to go on.
              sets:
                last.length > 0
                  ? last.map(() => ({ weightKg: null, reps: null }))
                  : Array.from({ length: 3 }, () => ({ weightKg: null, reps: null })),
            },
          ]);
        }}
      />
    </Panel>
  );
}

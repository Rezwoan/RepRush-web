'use client';
/**
 * The routine editor — the screen that was missing.
 *
 * You could create a routine (with `sets: 3` hardcoded and no rep range at all)
 * and delete a whole one, and that was the entire surface. The rows said
 * "5 exercises" and there was no way to see which five, let alone change a set
 * count. This is a full screen rather than a sheet because editing six
 * exercises with three numbers each does not fit in a drawer.
 *
 * **It must round-trip the whole exercise shape.** A package day carries
 * `repMin` / `repMax` / `restSec`, and the old `RoutineExercise` type only knew
 * `{ exerciseId, name, sets }` — so editing a ULPPL day through that type would
 * have silently flattened every rep range in the program. The editor holds and
 * writes back all of it, and the backend clamps rather than trusts.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp, Minus, Plus, Trash2 } from 'lucide-react';
import { profileApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ExercisePicker, Thumb, useCatalog } from '@/components/workout/exercise-picker';
import { Panel } from './panel';

export interface RoutineExercise {
  exerciseId: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
}

export interface EditableRoutine {
  id?: number;
  name: string;
  folderId: number | null;
  exercises: RoutineExercise[];
}

const REST_PRESETS = [30, 45, 60, 90, 120, 150, 180, 240];

const fmtRest = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ''}` : `${s}s`);

/** Defaults for anything a legacy row is missing, so an old routine opens whole. */
export const withDefaults = (e: any): RoutineExercise => ({
  exerciseId: e.exerciseId,
  name: e.name ?? e.exerciseId,
  sets: Number(e.sets) || 3,
  repMin: Number(e.repMin) || 8,
  repMax: Number(e.repMax) || Math.max(Number(e.repMin) || 8, 12),
  restSec: Number.isFinite(Number(e.restSec)) ? Number(e.restSec) : 90,
});

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`One fewer ${label}`}
        className="press grid h-7 w-7 place-items-center rounded-lg bg-secondary disabled:opacity-40"
      >
        <Minus size={13} />
      </button>
      <span className="nums w-6 text-center text-sm font-extrabold">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`One more ${label}`}
        className="press grid h-7 w-7 place-items-center rounded-lg bg-secondary disabled:opacity-40"
      >
        <Plus size={13} />
      </button>
    </div>
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
  const { byId } = useCatalog();
  const [routine, setRoutine] = useState<EditableRoutine>(initial);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const mutate = (fn: (l: RoutineExercise[]) => RoutineExercise[]) =>
    setRoutine((r) => ({ ...r, exercises: fn(r.exercises) }));

  const patch = (i: number, p: Partial<RoutineExercise>) =>
    mutate((l) => l.map((e, j) => (j === i ? { ...e, ...p } : e)));

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
      <div className="space-y-3 pb-28">
        <input
          value={routine.name}
          onChange={(e) => setRoutine({ ...routine, name: e.target.value })}
          placeholder="Routine name"
          aria-label="Routine name"
          className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
        />

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

        <ul className="space-y-2.5">
          {routine.exercises.map((e, i) => (
            <li key={`${e.exerciseId}-${i}`} className="surface p-3">
              <div className="flex items-center gap-2.5">
                {byId?.[e.exerciseId] && <Thumb ex={byId[e.exerciseId]} size={40} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold leading-tight">{byId?.[e.exerciseId]?.name ?? e.name}</p>
                  <p className="nums text-xs text-muted-foreground">
                    {e.sets} × {e.repMin}–{e.repMax} · rest {fmtRest(e.restSec)}
                  </p>
                </div>
                <button
                  onClick={() => mutate((l) => l.map((x, j) => (j === i - 1 ? l[i] : j === i ? l[i - 1] : x)))}
                  disabled={i === 0}
                  aria-label={`Move ${e.name} up`}
                  className="press grid h-7 w-7 place-items-center rounded-lg text-muted-foreground disabled:opacity-30"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() =>
                    mutate((l) => l.map((x, j) => (j === i + 1 ? l[i] : j === i ? l[i + 1] : x)))
                  }
                  disabled={i === routine.exercises.length - 1}
                  aria-label={`Move ${e.name} down`}
                  className="press grid h-7 w-7 place-items-center rounded-lg text-muted-foreground disabled:opacity-30"
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  onClick={() => mutate((l) => l.filter((_, j) => j !== i))}
                  aria-label={`Remove ${e.name}`}
                  className="press grid h-7 w-7 place-items-center rounded-lg text-muted-foreground"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
                <span className="font-bold text-muted-foreground">Sets</span>
                <Stepper
                  value={e.sets}
                  min={1}
                  max={20}
                  label={`set on ${e.name}`}
                  onChange={(v) => patch(i, { sets: v })}
                />

                <span className="font-bold text-muted-foreground">Reps</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={e.repMin}
                    aria-label={`Minimum reps on ${e.name}`}
                    onChange={(ev) => {
                      const v = Math.max(1, Math.min(100, parseInt(ev.target.value, 10) || 1));
                      // Push the max along rather than letting it fall below the
                      // min — an inverted range prescribes nothing.
                      patch(i, { repMin: v, repMax: Math.max(v, e.repMax) });
                    }}
                    className="nums w-14 rounded-lg border-2 border-border bg-card px-2 py-1 text-center font-bold outline-none focus:border-primary"
                  />
                  <span className="text-muted-foreground">to</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={e.repMax}
                    aria-label={`Maximum reps on ${e.name}`}
                    onChange={(ev) =>
                      patch(i, {
                        repMax: Math.max(
                          e.repMin,
                          Math.min(100, parseInt(ev.target.value, 10) || e.repMin),
                        ),
                      })
                    }
                    className="nums w-14 rounded-lg border-2 border-border bg-card px-2 py-1 text-center font-bold outline-none focus:border-primary"
                  />
                </div>

                <span className="font-bold text-muted-foreground">Rest</span>
                <select
                  value={e.restSec}
                  aria-label={`Rest on ${e.name}`}
                  onChange={(ev) => patch(i, { restSec: parseInt(ev.target.value, 10) })}
                  className="w-full rounded-lg border-2 border-border bg-card px-2 py-1 font-bold outline-none"
                >
                  {(REST_PRESETS.includes(e.restSec)
                    ? REST_PRESETS
                    : [...REST_PRESETS, e.restSec].sort((a, b) => a - b)
                  ).map((s) => (
                    <option key={s} value={s}>
                      {fmtRest(s)}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>

        <button
          onClick={() => setPicking(true)}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-3.5 font-bold text-muted-foreground"
        >
          <Plus size={18} /> Add exercise
        </button>

        {routine.exercises.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            A routine needs at least one exercise before it can be started.
          </p>
        )}
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
        onPick={(cat) => {
          setPicking(false);
          mutate((l) => [
            ...l,
            {
              exerciseId: cat.id,
              name: cat.name,
              sets: 3,
              // The catalog's own rep range and rest, not a flat 3×8: the
              // difference between a heavy squat and a lateral raise is exactly
              // the thing a default should not flatten.
              repMin: cat.repMin,
              repMax: cat.repMax,
              restSec: cat.restSec,
            },
          ]);
        }}
      />
    </Panel>
  );
}

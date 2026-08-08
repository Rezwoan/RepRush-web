'use client';
/**
 * What the Workout tab opens on: your program.
 *
 * Before this existed the tab called `generate()` on mount and handed everyone
 * a session they had not asked for — while `routines` and `routine_folders`
 * carried full CRUD that only Profile could reach, so a routine could be
 * written and never run. This is the missing half: the screen that picks one.
 *
 * Generating is still here, because it is genuinely useful when you have twenty
 * minutes and no plan. It is a choice now rather than the only path.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronRight, Layers, Pencil, Sparkles, Star, Wand2 } from 'lucide-react';
import { profileApi } from '@/lib/api';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/display';
import { SparkAmount } from '@/components/ui/spark';

export interface RoutineSummary {
  id: number;
  name: string;
  exercises: { exerciseId: string; name: string; sets: { reps: number | null }[] }[];
  lastUsedAt?: string | null;
}

export interface FolderSummary {
  id: number;
  name: string;
  isDefault: boolean;
  packageId: string | null;
  routines: RoutineSummary[];
}

export interface RoutineList {
  folders: FolderSummary[];
  loose: RoutineSummary[];
  total: number;
}

interface PackageSummary {
  id: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  level: string;
  owned: boolean;
  days: { name: string; focus: string; exercises: string[] }[];
}

/**
 * Which day to suggest: the one gone longest without. A six-day split rotates
 * on its own that way, instead of asking someone to remember where they are in
 * the week. Never used at all sorts first — a day you have never done is the
 * one most overdue.
 */
function nextUp(routines: RoutineSummary[]): number | null {
  if (!routines.length) return null;
  const stamp = (r: RoutineSummary) => (r.lastUsedAt ? new Date(r.lastUsedAt).getTime() : 0);
  return routines.reduce((best, r) => (stamp(r) < stamp(best) ? r : best), routines[0]).id;
}

function DayCard({
  routine,
  suggested,
  onStart,
  onEdit,
}: {
  routine: RoutineSummary;
  suggested: boolean;
  onStart: () => void;
  onEdit?: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border-2',
        suggested ? 'border-primary bg-primary/5' : 'border-border bg-card',
      )}
    >
      <button onClick={onStart} className="press w-full p-4 pb-2 text-left">
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-lg font-extrabold">{routine.name}</span>
          {suggested && (
            <span className="rounded-full bg-primary-fill px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary-foreground">
              Next up
            </span>
          )}
          <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
        </div>
        {/* The exercises, not just a count — you should be able to tell the
            difference between two days without opening either. */}
        <ul className="mt-2 space-y-0.5">
          {routine.exercises.slice(0, 6).map((e, i) => (
            <li
              key={`${e.exerciseId}-${i}`}
              className="flex items-baseline gap-2 text-sm text-muted-foreground"
            >
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              <span className="nums shrink-0 text-xs">{e.sets?.length ?? 0} sets</span>
            </li>
          ))}
          {routine.exercises.length > 6 && (
            <li className="text-sm text-muted-foreground">
              +{routine.exercises.length - 6} more
            </li>
          )}
          {routine.exercises.length === 0 && (
            <li className="text-sm text-muted-foreground">No exercises yet</li>
          )}
        </ul>
      </button>
      {onEdit && (
        <button
          onClick={onEdit}
          className="press flex w-full items-center justify-center gap-1.5 border-t border-border/60 py-2 text-xs font-bold text-muted-foreground"
        >
          <Pencil size={13} /> Edit this day
        </button>
      )}
    </div>
  );
}

export function RoutineChooser({
  onPickRoutine,
  onGenerate,
  onManage,
}: {
  onPickRoutine: (routineId: number) => void;
  onGenerate: () => void;
  onManage: () => void;
}) {
  const [list, setList] = useState<RoutineList | null>(null);
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    profileApi
      .routines()
      .then((r) => setList(r.data))
      .catch(() => setList({ folders: [], loose: [], total: 0 }));
  }, []);

  useEffect(load, [load]);

  const openPackages = () => {
    setPackagesOpen(true);
    if (!packages) {
      profileApi
        .routinePackages()
        .then((r) => setPackages(r.data.packages))
        .catch(() => setPackages([]));
    }
  };

  const claim = async (id: string) => {
    setClaiming(id);
    setError(null);
    try {
      const r = await profileApi.claimPackage(id);
      setList(r.data);
      setPackages((p) => p?.map((x) => (x.id === id ? { ...x, owned: true } : x)) ?? null);
      setPackagesOpen(false);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not add that program');
    } finally {
      setClaiming(null);
    }
  };

  const setDefault = async (folderId: number) => {
    const r = await profileApi.setDefaultFolder(folderId).catch(() => null);
    if (r) setList(r.data);
  };

  if (!list) return <div className="surface mt-4 h-64 animate-pulse opacity-60" />;

  const primary = list.folders.find((f) => f.isDefault) ?? list.folders[0] ?? null;
  const others = list.folders.filter((f) => f.id !== primary?.id);
  const suggestedId = primary ? nextUp(primary.routines) : null;

  const packageSheet = (
    <Sheet open={packagesOpen} onOpenChange={setPackagesOpen} title="Programs">
      <div className="space-y-3 pb-2">
        {!packages && <div className="surface h-40 animate-pulse opacity-60" />}
        {packages?.map((p) => (
          <div key={p.id} className="surface space-y-2 p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold leading-tight">{p.name}</p>
                <p className="text-sm text-muted-foreground">{p.tagline}</p>
              </div>
              {p.price > 0 ? (
                <SparkAmount amount={p.price} size={14} />
              ) : (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">Free</span>
              )}
            </div>
            <p className="text-sm">{p.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {p.days.map((d) => (
                <span key={d.name} className="rounded-lg bg-secondary px-2 py-1 text-xs font-bold">
                  {d.name}
                </span>
              ))}
            </div>
            <Button
              variant={p.owned ? 'chunkyOutline' : 'chunky'}
              className="w-full"
              disabled={p.owned || claiming === p.id}
              onClick={() => void claim(p.id)}
            >
              {p.owned ? (
                <>
                  <Check size={16} /> Added
                </>
              ) : claiming === p.id ? (
                'Adding…'
              ) : (
                'Use this program'
              )}
            </Button>
          </div>
        ))}
        {error && <p className="text-sm font-bold text-destructive">{error}</p>}
        <p className="text-center text-xs text-muted-foreground">
          More programs are coming — they will be claimable with Spark.
        </p>
      </div>
    </Sheet>
  );

  // ── nothing saved yet ──
  if (list.total === 0) {
    return (
      <div className="pb-6">
        <EmptyState
          pose="idle"
          title="You don't have a routine yet"
          description="Pick a ready-made program, build your own, or let RepRush put one together for today."
        />
        <div className="mt-4 space-y-2.5">
          <Button variant="chunky" size="cta" className="w-full" onClick={openPackages}>
            <Layers size={18} /> Browse programs
          </Button>
          <Button variant="chunkyOutline" size="cta" className="w-full" onClick={onManage}>
            <Pencil size={18} /> Build my own
          </Button>
          <Button variant="chunkyLight" size="cta" className="w-full" onClick={onGenerate}>
            <Wand2 size={18} /> Just make me one for today
          </Button>
        </div>
        {packageSheet}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {primary && (
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft}>
          <div className="mb-2.5 flex items-center gap-2">
            <h2 className="flex-1 truncate text-[22px] font-bold">{primary.name}</h2>
            {!primary.isDefault && (
              <button
                onClick={() => void setDefault(primary.id)}
                className="press flex items-center gap-1 text-sm font-bold text-primary"
              >
                <Star size={14} /> Make default
              </button>
            )}
          </div>
          <div className="space-y-2.5">
            {primary.routines.map((r) => (
              <DayCard
                key={r.id}
                routine={r}
                suggested={r.id === suggestedId}
                onStart={() => onPickRoutine(r.id)}
                onEdit={onManage}
              />
            ))}
            {primary.routines.length === 0 && (
              <p className="text-sm text-muted-foreground">This program has no days yet.</p>
            )}
          </div>
        </motion.section>
      )}

      {(others.length > 0 || list.loose.length > 0) && (
        <section>
          <h2 className="mb-2.5 text-[22px] font-bold">Your other routines</h2>
          <div className="space-y-2.5">
            {others.flatMap((f) =>
              f.routines.map((r) => (
                <DayCard
                  key={r.id}
                  routine={{ ...r, name: `${f.name} · ${r.name}` }}
                  suggested={false}
                  onStart={() => onPickRoutine(r.id)}
                />
              )),
            )}
            {list.loose.map((r) => (
              <DayCard key={r.id} routine={r} suggested={false} onStart={() => onPickRoutine(r.id)} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2.5">
        <Button variant="chunkyLight" size="cta" className="w-full" onClick={onGenerate}>
          <Sparkles size={18} /> Build me something else
        </Button>
        <div className="flex gap-2.5">
          <Button variant="chunkyOutline" className="flex-1" onClick={openPackages}>
            <Layers size={16} /> Programs
          </Button>
          <Button variant="chunkyOutline" className="flex-1" onClick={onManage}>
            <Pencil size={16} /> Edit routines
          </Button>
        </div>
      </section>

      {packageSheet}
    </div>
  );
}

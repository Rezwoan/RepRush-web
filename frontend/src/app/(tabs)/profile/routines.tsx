'use client';
/**
 * Routines, their folders, and user-authored exercises (SPEC §12.3).
 *
 * One screen with two tabs because they are the same kind of thing — a library
 * of stuff you made — and because `Create Exercise` was deferred out of P6's
 * picker to exactly here.
 */
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Folder, FolderPlus, Plus, Trash2 } from 'lucide-react';
import { exercisesApi, profileApi } from '@/lib/api';
import { MUSCLES } from '@/lib/muscles';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/display';
import { Sheet } from '@/components/ui/sheet';
import { EquipmentIcon, type Equipment } from '@/components/art/equipment-icon';
import { cn } from '@/lib/utils';
import { Panel } from './panel';

const EQUIPMENT: Equipment[] = [
  'barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell', 'band', 'plate',
];

interface RoutineExercise {
  exerciseId: string;
  name: string;
  sets: number;
}

interface Routine {
  id: number;
  name: string;
  folderId: number | null;
  exercises: RoutineExercise[];
  updatedAt: string;
}

interface Library {
  folders: { id: number; name: string; routines: Routine[] }[];
  loose: Routine[];
}

export function RoutinesPanel({
  tab: initialTab,
  onBack,
}: {
  tab: 'routines' | 'exercises';
  onBack: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [library, setLibrary] = useState<Library | null>(null);
  const [mine, setMine] = useState<any[] | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [sheet, setSheet] = useState<'folder' | 'routine' | 'exercise' | null>(null);

  // New-routine / new-folder / new-exercise drafts.
  const [folderName, setFolderName] = useState('');
  const [routine, setRoutine] = useState<{ name: string; folderId: number | null; exercises: RoutineExercise[] }>({
    name: '',
    folderId: null,
    exercises: [],
  });
  const [draft, setDraft] = useState<{ name: string; primaryMuscle: string; equipment: string; mechanic: string }>(
    { name: '', primaryMuscle: MUSCLES[0].id, equipment: 'barbell', mechanic: 'compound' },
  );
  const [picking, setPicking] = useState(false);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const [lib, ex] = await Promise.all([
      profileApi.routines().catch(() => null),
      profileApi.exercises().catch(() => null),
    ]);
    setLibrary(lib?.data ?? { folders: [], loose: [] });
    setMine(ex?.data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openPicker = async () => {
    setPicking(true);
    if (!catalog.length) {
      const res = await exercisesApi.catalog().catch(() => null);
      setCatalog(res?.data ?? []);
    }
  };

  const saveRoutine = async () => {
    if (!routine.name.trim()) return;
    const res = await profileApi.saveRoutine(routine).catch(() => null);
    if (res) setLibrary(res.data);
    setRoutine({ name: '', folderId: null, exercises: [] });
    setSheet(null);
  };

  const RoutineRow = ({ r }: { r: Routine }) => (
    <div className="surface flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{r.name}</p>
        <p className="text-xs text-muted-foreground">
          {r.exercises.length} exercise{r.exercises.length === 1 ? '' : 's'}
        </p>
      </div>
      <button
        aria-label={`Delete ${r.name}`}
        className="press text-muted-foreground"
        onClick={async () => {
          const res = await profileApi.deleteRoutine(r.id).catch(() => null);
          if (res) setLibrary(res.data);
        }}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  return (
    <Panel
      title="Library"
      onBack={onBack}
      action={
        <button
          onClick={() => setSheet(tab === 'routines' ? 'routine' : 'exercise')}
          aria-label="Create"
          className="press text-primary"
        >
          <Plus size={24} />
        </button>
      }
    >
      <Segmented
        options={[
          { value: 'routines', label: 'Routines' },
          { value: 'exercises', label: 'Exercises' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as 'routines' | 'exercises')}
      />

      {tab === 'routines' && (
        <div className="mt-4 space-y-3">
          <Button variant="chunkyOutline" onClick={() => setSheet('folder')}>
            <FolderPlus size={16} className="mr-2" /> Create folder
          </Button>

          {library?.folders.map((f) => {
            const expanded = open.has(f.id);
            return (
              <div key={f.id} className="overflow-hidden rounded-2xl border border-border">
                <button
                  onClick={() =>
                    setOpen((s) => {
                      const next = new Set(s);
                      if (next.has(f.id)) next.delete(f.id);
                      else next.add(f.id);
                      return next;
                    })
                  }
                  className="press flex w-full items-center gap-3 bg-card p-3 text-left"
                >
                  <Folder size={18} className="text-primary" />
                  <span className="flex-1 font-bold">{f.name}</span>
                  <span className="nums text-sm text-muted-foreground">{f.routines.length}</span>
                  <ChevronDown
                    size={18}
                    className={cn('text-muted-foreground transition-transform', expanded && 'rotate-180')}
                  />
                </button>
                {expanded && (
                  <div className="space-y-2 bg-muted/30 p-2">
                    {f.routines.length === 0 && (
                      <p className="py-3 text-center text-sm text-muted-foreground">Empty folder.</p>
                    )}
                    {f.routines.map((r) => (
                      <RoutineRow key={r.id} r={r} />
                    ))}
                    <button
                      onClick={async () => {
                        const res = await profileApi.deleteFolder(f.id).catch(() => null);
                        if (res) setLibrary(res.data);
                      }}
                      className="press w-full py-2 text-xs font-bold text-muted-foreground"
                    >
                      Delete folder (keeps its routines)
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {library?.loose.map((r) => (
            <RoutineRow key={r.id} r={r} />
          ))}

          {library && !library.folders.length && !library.loose.length && (
            <EmptyState
              title="No routines yet"
              description="Save a session you like and it lands here, ready to start again."
              action={
                <Button variant="chunky" size="cta" onClick={() => setSheet('routine')}>
                  New routine
                </Button>
              }
            />
          )}
        </div>
      )}

      {tab === 'exercises' && (
        <div className="mt-4 space-y-2">
          {mine?.length === 0 && (
            <EmptyState
              title="No custom exercises"
              description="The catalog has 873. Add your own when it is missing something."
              action={
                <Button variant="chunky" size="cta" onClick={() => setSheet('exercise')}>
                  Create exercise
                </Button>
              }
            />
          )}
          {mine?.map((e) => (
            <div key={e.id} className="surface flex items-center gap-3 p-3">
              <EquipmentIcon equipment={e.equipment as Equipment} size={22} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{e.name}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {e.primary[0]?.replace(/_/g, ' ')} · {e.mechanic}
                </p>
              </div>
              <button
                aria-label={`Delete ${e.name}`}
                className="press text-muted-foreground"
                onClick={async () => {
                  await profileApi.deleteExercise(parseInt(String(e.id).split(':')[1], 10)).catch(() => {});
                  load();
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={sheet === 'folder'} onOpenChange={() => setSheet(null)} title="Create folder">
        <div className="space-y-3 pb-2">
          <input
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Folder name"
            className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
          />
          <Button
            variant="chunky"
            size="cta"
            disabled={!folderName.trim()}
            onClick={async () => {
              const res = await profileApi.createFolder(folderName.trim()).catch(() => null);
              if (res) setLibrary(res.data);
              setFolderName('');
              setSheet(null);
            }}
          >
            Create
          </Button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'routine'} onOpenChange={() => setSheet(null)} title="New routine">
        <div className="space-y-3 pb-2">
          <input
            value={routine.name}
            onChange={(e) => setRoutine({ ...routine, name: e.target.value })}
            placeholder="Routine name"
            className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
          />
          {library && library.folders.length > 0 && (
            <select
              value={routine.folderId ?? ''}
              onChange={(e) =>
                setRoutine({ ...routine, folderId: e.target.value ? parseInt(e.target.value, 10) : null })
              }
              className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none"
            >
              <option value="">No folder</option>
              {library.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}

          <div className="space-y-2">
            {routine.exercises.map((e, i) => (
              <div key={`${e.exerciseId}-${i}`} className="flex items-center gap-2 rounded-xl bg-muted/50 p-2.5">
                <span className="flex-1 truncate text-sm font-bold">{e.name}</span>
                <span className="nums text-xs text-muted-foreground">{e.sets} sets</span>
                <button
                  aria-label={`Remove ${e.name}`}
                  onClick={() =>
                    setRoutine({ ...routine, exercises: routine.exercises.filter((_, j) => j !== i) })
                  }
                  className="press text-muted-foreground"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <Button variant="chunkyOutline" onClick={openPicker}>
            <Plus size={16} className="mr-2" /> Exercise
          </Button>
          <Button variant="chunky" size="cta" disabled={!routine.name.trim()} onClick={saveRoutine}>
            Save routine
          </Button>
        </div>
      </Sheet>

      <Sheet open={picking} onOpenChange={setPicking} title="Add an exercise">
        <div className="space-y-2 pb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the catalog"
            className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
          />
          <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
            {catalog
              .filter((e) => !query || e.name.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 40)
              .map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    setRoutine((r) => ({
                      ...r,
                      exercises: [...r.exercises, { exerciseId: e.id, name: e.name, sets: 3 }],
                    }));
                    setPicking(false);
                  }}
                  className="press flex w-full items-center gap-3 rounded-xl bg-card p-2.5 text-left"
                >
                  <EquipmentIcon equipment={e.equipment as Equipment} size={20} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{e.name}</span>
                </button>
              ))}
          </div>
        </div>
      </Sheet>

      <Sheet open={sheet === 'exercise'} onOpenChange={() => setSheet(null)} title="Create exercise">
        <div className="space-y-3 pb-2">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Exercise name"
            className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
          />
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Primary muscle
            </span>
            <select
              value={draft.primaryMuscle}
              onChange={(e) => setDraft({ ...draft, primaryMuscle: e.target.value })}
              className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none"
            >
              {MUSCLES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {EQUIPMENT.map((eq) => (
              <button
                key={eq}
                onClick={() => setDraft({ ...draft, equipment: eq })}
                className={cn(
                  'press flex shrink-0 flex-col items-center gap-1 rounded-xl border-2 px-3 py-2 text-[11px] font-bold capitalize',
                  draft.equipment === eq ? 'border-primary bg-primary/10' : 'border-border bg-card',
                )}
              >
                <EquipmentIcon equipment={eq} size={20} />
                {eq}
              </button>
            ))}
          </div>
          <Segmented
            options={[
              { value: 'compound', label: 'Compound' },
              { value: 'isolation', label: 'Isolation' },
            ]}
            value={draft.mechanic}
            onChange={(v) => setDraft({ ...draft, mechanic: v })}
          />
          <p className="text-xs text-muted-foreground">
            The muscle and the mechanic are what the rank engine scores against, so pick them
            honestly — an isolation lift logged as a compound will rank you lower, not higher.
          </p>
          <Button
            variant="chunky"
            size="cta"
            disabled={!draft.name.trim()}
            onClick={async () => {
              await profileApi.createExercise(draft).catch(() => {});
              setDraft({ ...draft, name: '' });
              setSheet(null);
              setTab('exercises');
              load();
            }}
          >
            Create
          </Button>
        </div>
      </Sheet>
    </Panel>
  );
}

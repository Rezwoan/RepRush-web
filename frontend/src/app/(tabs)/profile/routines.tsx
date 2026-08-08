'use client';
/**
 * Routines, their folders, and user-authored exercises (SPEC §12.3).
 *
 * One screen with two tabs because they are the same kind of thing — a library
 * of stuff you made — and because `Create Exercise` was deferred out of P6's
 * picker to exactly here.
 */
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Folder, FolderPlus, Plus, Share2, Trash2 } from 'lucide-react';
import { exercisesApi, profileApi } from '@/lib/api';
import { MUSCLES } from '@/lib/muscles';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/display';
import { Sheet } from '@/components/ui/sheet';
import { RoutineEditor, withDefaults, type EditableRoutine, type RoutineExercise } from './routine-editor';
import { EquipmentIcon, type Equipment } from '@/components/art/equipment-icon';
import { cn } from '@/lib/utils';
import { Panel } from './panel';

const EQUIPMENT: Equipment[] = [
  'barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell', 'band', 'plate',
];

interface Routine {
  id: number;
  name: string;
  folderId: number | null;
  exercises: RoutineExercise[];
  updatedAt: string;
}

interface Library {
  folders: {
    id: number;
    name: string;
    routines: Routine[];
    isDefault?: boolean;
    packageId?: string | null;
    shareCode?: string | null;
  }[];
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

  // New-folder / new-exercise drafts. Routines go through the editor.
  const [folderName, setFolderName] = useState('');
  const [editing, setEditing] = useState<EditableRoutine | null>(null);
  const [share, setShare] = useState<{ name: string; link: string } | null>(null);
  const [expandedRoutine, setExpandedRoutine] = useState<Set<number>>(new Set());
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

  const blankRoutine = (folderId: number | null = null): EditableRoutine => ({
    name: '',
    folderId,
    exercises: [],
  });

  /**
   * A routine row. It used to be a name, a count and a delete button — you could
   * not see which exercises were in it, let alone change one. It expands to the
   * real list now, and the whole header opens the editor.
   */
  const RoutineRow = ({ r }: { r: Routine }) => {
    const expanded = expandedRoutine.has(r.id);
    return (
      <div className="surface overflow-hidden">
        <div className="flex items-center gap-2 p-3">
          <button
            onClick={() =>
              setExpandedRoutine((s) => {
                const next = new Set(s);
                if (next.has(r.id)) next.delete(r.id);
                else next.add(r.id);
                return next;
              })
            }
            aria-label={expanded ? `Hide ${r.name}'s exercises` : `Show ${r.name}'s exercises`}
            aria-expanded={expanded}
            className="press grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground"
          >
            <ChevronDown size={16} className={cn('transition-transform', expanded && 'rotate-180')} />
          </button>
          <button
            onClick={() =>
              setEditing({
                id: r.id,
                name: r.name,
                folderId: r.folderId,
                exercises: (r.exercises ?? []).map(withDefaults),
              })
            }
            className="press min-w-0 flex-1 text-left"
          >
            <p className="truncate font-bold">{r.name}</p>
            <p className="text-xs text-muted-foreground">
              {r.exercises.length} exercise{r.exercises.length === 1 ? '' : 's'} · tap to edit
            </p>
          </button>
          <button
            aria-label={`Delete ${r.name}`}
            className="press shrink-0 text-muted-foreground"
            onClick={async () => {
              const res = await profileApi.deleteRoutine(r.id).catch(() => null);
              if (res) setLibrary(res.data);
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>

        {expanded && (
          <ul className="space-y-1 border-t border-border bg-muted/30 px-3 py-2">
            {r.exercises.length === 0 && (
              <li className="py-2 text-center text-sm text-muted-foreground">No exercises yet.</li>
            )}
            {r.exercises.map((e, i) => {
              const x = withDefaults(e);
              return (
                <li key={`${x.exerciseId}-${i}`} className="flex items-baseline gap-2 py-1 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold">{x.name}</span>
                  <span className="nums shrink-0 text-xs text-muted-foreground">
                    {x.sets} × {x.repMin}–{x.repMax}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  if (editing) {
    return (
      <RoutineEditor
        initial={editing}
        folders={library?.folders.map((f) => ({ id: f.id, name: f.name })) ?? []}
        onBack={() => setEditing(null)}
        onSaved={(lib) => setLibrary(lib)}
      />
    );
  }

  return (
    <Panel
      title="Library"
      onBack={onBack}
      action={
        <button
          onClick={() => (tab === 'routines' ? setEditing(blankRoutine()) : setSheet('exercise'))}
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
                      onClick={() => setEditing(blankRoutine(f.id))}
                      className="press flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-2.5 text-sm font-bold text-muted-foreground"
                    >
                      <Plus size={15} /> Add a day
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          const res = await profileApi.shareFolder(f.id).catch(() => null);
                          if (res) {
                            setShare({ name: res.data.name, link: res.data.link });
                            void load();
                          }
                        }}
                        className="press flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-bold text-primary"
                      >
                        <Share2 size={14} /> {f.shareCode ? 'Share link' : 'Share with friends'}
                      </button>
                      <button
                        onClick={async () => {
                          const res = await profileApi.deleteFolder(f.id).catch(() => null);
                          if (res) setLibrary(res.data);
                        }}
                        className="press flex-1 py-2 text-xs font-bold text-muted-foreground"
                      >
                        Delete folder
                      </button>
                    </div>
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
                <Button variant="chunky" size="cta" onClick={() => setEditing(blankRoutine())}>
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

      <Sheet
        open={!!share}
        onOpenChange={(v) => !v && setShare(null)}
        title={`Share ${share?.name ?? 'program'}`}
      >
        <div className="space-y-3 pb-2">
          <p className="text-sm text-muted-foreground">
            Anyone with this link can take a copy of the program. Their copy is theirs — editing it
            never touches yours.
          </p>
          <p className="break-all rounded-2xl border-2 border-border bg-card px-4 py-3 text-sm font-semibold">
            {share?.link}
          </p>
          <Button
            variant="chunky"
            size="cta"
            onClick={async () => {
              if (!share) return;
              // Web Share where it exists, clipboard where it does not — the
              // same pair the referral invite already uses.
              const data = { title: share.name, text: `My ${share.name} program on RepRush`, url: share.link };
              if (navigator.share) await navigator.share(data).catch(() => {});
              else await navigator.clipboard?.writeText(share.link).catch(() => {});
            }}
          >
            <Share2 size={16} className="mr-2" /> Send to a friend
          </Button>
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

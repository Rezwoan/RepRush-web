'use client';
/**
 * Exercise picker (SPEC §5.4).
 *
 * The whole 873-exercise catalog is fetched once and filtered client-side. It
 * is ~350 KB of JSON, ~45 KB over the wire after Cloudflare's gzip, identical
 * for every user and never changes between deploys — so one fetch cached in
 * localStorage beats a search endpoint round-tripping to a Pi on every
 * keystroke, and it keeps working in a basement gym with no signal.
 */
import { useEffect, useMemo, useState } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { exercisesApi } from '@/lib/api';
import { MUSCLE_BY_ID, MUSCLE_GROUPS, GROUP_LABEL, type MuscleGroup, type MuscleId } from '@/lib/muscles';
import { cn } from '@/lib/utils';
import { Sheet } from '@/components/ui/sheet';
import { Chip } from '@/components/ui/controls';
import { EquipmentIcon, EQUIPMENT, type Equipment } from '@/components/art/equipment-icon';
import { RankBadge } from '@/components/art/rank-badge';
import type { Rank } from '@/lib/ranks';

const CACHE_KEY = 'reprush_catalog_v1';

export interface CatalogExercise {
  id: string;
  name: string;
  primary: string[];
  secondary: string[];
  equipment: Equipment;
  level: 'beginner' | 'intermediate' | 'expert';
  mechanic: 'compound' | 'isolation' | null;
  category: string;
  repMin: number;
  repMax: number;
  restSec: number;
  image: string | null;
}

/** Ranks and performance counts the picker decorates rows with, when known. */
export interface PickerContext {
  ranks?: Record<string, { rank: Rank; sets: number }>;
}

type Sort = 'alpha' | 'rank' | 'performed' | 'muscle';

/**
 * The catalog, cached. Exported because the builder and the session screen both
 * need to resolve an id to a name and a picture without another request.
 */
export function useCatalog() {
  const [list, setList] = useState<CatalogExercise[] | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) setList(JSON.parse(raw));
    } catch {
      /* a bad cache is not worth a crash — the fetch below replaces it */
    }
    exercisesApi
      .catalog()
      .then((r) => {
        setList(r.data);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(r.data));
        } catch {
          /* quota — the cache is an optimisation */
        }
      })
      .catch(() => {
        /* offline: whatever the cache gave us is the answer */
      });
  }, []);

  const byId = useMemo(
    () => Object.fromEntries((list ?? []).map((e) => [e.id, e])) as Record<string, CatalogExercise>,
    [list],
  );

  return { list, byId };
}

export function ExercisePicker({
  open,
  onOpenChange,
  onPick,
  context,
  /** Pre-select a muscle filter — "add another chest exercise". */
  muscle,
  excludeIds = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (ex: CatalogExercise) => void;
  context?: PickerContext;
  muscle?: string;
  excludeIds?: string[];
}) {
  const { list } = useCatalog();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [sort, setSort] = useState<Sort>('alpha');

  // Reopening for a different muscle should not inherit the last filter.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setEquipment(null);
    setGroup(muscle ? ((MUSCLE_BY_ID[muscle as MuscleId]?.group as MuscleGroup) ?? null) : null);
  }, [open, muscle]);

  const rows = useMemo(() => {
    if (!list) return [];
    const needle = q.trim().toLowerCase();
    const exclude = new Set(excludeIds);
    const ranked = context?.ranks ?? {};

    const filtered = list.filter((e) => {
      if (exclude.has(e.id)) return false;
      if (needle && !e.name.toLowerCase().includes(needle)) return false;
      if (equipment && e.equipment !== equipment) return false;
      if (group) {
        const inGroup = [...e.primary, ...e.secondary].some(
          (m) => MUSCLE_BY_ID[m as MuscleId]?.group === group,
        );
        if (!inGroup) return false;
      }
      return true;
    });

    const byName = (a: CatalogExercise, b: CatalogExercise) => a.name.localeCompare(b.name);
    if (sort === 'rank') {
      return filtered.sort(
        (a, b) => (ranked[b.id]?.rank.lp ?? -1) - (ranked[a.id]?.rank.lp ?? -1) || byName(a, b),
      );
    }
    if (sort === 'performed') {
      return filtered.sort((a, b) => (ranked[b.id]?.sets ?? 0) - (ranked[a.id]?.sets ?? 0) || byName(a, b));
    }
    if (sort === 'muscle') {
      return filtered.sort((a, b) => a.primary[0].localeCompare(b.primary[0]) || byName(a, b));
    }
    return filtered.sort(byName);
  }, [list, q, group, equipment, sort, excludeIds, context]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add exercise" className="h-[92dvh]">
      <div className="sticky top-0 z-10 -mx-5 bg-popover px-5 pb-3">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search 873 exercises"
            className="w-full rounded-xl border-2 border-border bg-card py-3 pl-10 pr-10 font-semibold outline-none focus:border-primary"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {(['alpha', 'rank', 'performed', 'muscle'] as Sort[]).map((s) => (
            <Chip key={s} active={sort === s} onClick={() => setSort(s)}>
              {{ alpha: 'Alphabetical', rank: 'By Rank', performed: 'Performed', muscle: 'Muscle' }[s]}
            </Chip>
          ))}
        </div>

        <div className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1">
          {MUSCLE_GROUPS.map((g) => (
            <Chip key={g} active={group === g} onClick={() => setGroup(group === g ? null : g)}>
              {GROUP_LABEL[g]}
            </Chip>
          ))}
        </div>

        <div className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1">
          {EQUIPMENT.map((e) => (
            <Chip key={e} active={equipment === e} onClick={() => setEquipment(equipment === e ? null : e)}>
              <EquipmentIcon equipment={e} size={16} />
              <span className="capitalize">{e}</span>
            </Chip>
          ))}
        </div>
      </div>

      {!list && <p className="py-10 text-center text-sm text-muted-foreground">Loading the catalog…</p>}
      {list && !rows.length && (
        <p className="py-10 text-center text-sm text-muted-foreground">Nothing matches those filters.</p>
      )}

      <ul className="divide-y divide-border">
        {rows.slice(0, 120).map((e) => {
          const mine = context?.ranks?.[e.id];
          const muscleLabel = MUSCLE_BY_ID[e.primary[0] as MuscleId]?.label ?? e.primary[0];
          return (
            <li key={e.id}>
              <button
                onClick={() => {
                  onPick(e);
                  onOpenChange(false);
                }}
                className="press flex w-full items-center gap-3 py-3 text-left"
              >
                <Thumb ex={e} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-primary">
                    {muscleLabel}
                  </span>
                  <span className="block truncate font-bold">{e.name}</span>
                  {mine && (
                    <span className="nums block text-xs text-muted-foreground">
                      {mine.sets} {mine.sets === 1 ? 'set' : 'sets'} logged
                    </span>
                  )}
                </span>
                {mine ? (
                  <RankBadge
                    tier={mine.rank.tier}
                    division={mine.rank.division}
                    size="sm"
                    animated={false}
                    showDivision={false}
                  />
                ) : (
                  <Plus size={18} className="shrink-0 text-muted-foreground" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length > 120 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {rows.length - 120} more — keep typing to narrow it down.
        </p>
      )}
    </Sheet>
  );
}

/**
 * The row thumbnail: the catalog's own photo when it loads, the equipment glyph
 * when it does not. The photos are on jsDelivr (see MEMORY.md), so in a gym
 * with no signal the glyph is what everyone sees — which is why it has to be a
 * real icon rather than a grey box.
 */
export function Thumb({ ex, size = 44 }: { ex: CatalogExercise; size?: number }) {
  const [failed, setFailed] = useState(false);
  const group = MUSCLE_BY_ID[ex.primary[0] as MuscleId]?.group as MuscleGroup | undefined;

  if (ex.image && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ex.image}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('shrink-0 rounded-xl border border-border object-cover')}
        style={{ width: size, height: size }}
      />
    );
  }
  return <EquipmentIcon equipment={ex.equipment} group={group} size={size} boxed />;
}

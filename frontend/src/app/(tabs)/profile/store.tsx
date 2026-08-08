'use client';
/**
 * The Store — one screen, two views.
 *
 * Store and Inventory were always this same component behind a `mode` prop, but
 * the Profile grid showed them as two separate tiles, so the buy-then-equip
 * loop read as two unrelated screens and nothing said that what you bought
 * ended up in the other one. They are Shop and Owned tabs now, and Spark is
 * spelled out in the header next to a link back to where it is earned.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Lock, Target } from 'lucide-react';
import { profileApi } from '@/lib/api';
import { useTheme } from '@/lib/theme-context';
import { statsChanged } from '@/lib/shell-stats';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/display';
import { SparkAmount } from '@/components/ui/spark';
import { cn } from '@/lib/utils';
import { Panel } from './panel';
import type { Cosmetic } from './types';

interface Store {
  currency: number;
  equipped: { title: string; border: string; banner: string };
  items: Cosmetic[];
}

const KINDS = [
  { value: 'title', label: 'Titles' },
  { value: 'border', label: 'Borders' },
  { value: 'banner', label: 'Banners' },
  { value: 'theme', label: 'Themes' },
];

export function StorePanel({
  mode: initialMode,
  onBack,
  onChanged,
  onQuests,
}: {
  /** Which view to land on. `?view=inventory` still opens Owned directly. */
  mode: 'store' | 'inventory';
  onBack: () => void;
  onChanged: () => void;
  onQuests?: () => void;
}) {
  const { themeId, setThemeId } = useTheme();
  const [store, setStore] = useState<Store | null>(null);
  const [mode, setMode] = useState<'store' | 'inventory'>(initialMode);
  const [kind, setKind] = useState('title');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const res = await profileApi.store().catch(() => null);
    setStore(res?.data ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (c: Cosmetic) => {
    setMessage('');
    try {
      // A theme is owned server-side but *applied* client-side — the pre-paint
      // boot script picks one before any request could answer, and it has to
      // work offline. So there is no `themeId` to write.
      if (c.kind === 'theme' && c.owned) {
        setThemeId(c.id.replace(/^theme\./, ''));
        return;
      }
      if (c.owned) {
        await profileApi.update({ [`${c.kind}Id`]: c.id });
      } else {
        const res = await profileApi.buy(c.id);
        setStore(res.data);
      }
      await load();
      onChanged();
      // Buying spends Spark and equipping changes the avatar's border — both
      // are drawn in the top bar, which is outside this screen's world.
      statsChanged();
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'That did not work.');
    }
  };

  const items = (store?.items ?? []).filter(
    (c) => c.kind === kind && (mode === 'store' || c.owned),
  );
  const owned = (store?.items ?? []).filter((c) => c.owned).length;

  return (
    <Panel
      title="Store"
      onBack={onBack}
      action={
        <span className="nums rounded-full bg-secondary px-3 py-1 text-sm font-extrabold">
          <SparkAmount amount={store?.currency ?? 0} size={16} label />
        </span>
      }
    >
      <Segmented
        options={[
          { value: 'store', label: 'Shop' },
          { value: 'inventory', label: `Owned (${owned})` },
        ]}
        value={mode}
        onChange={(v) => setMode(v as 'store' | 'inventory')}
      />

      <div className="mt-3">
        <Segmented options={KINDS} value={kind} onChange={setKind} />
      </div>

      {message && <p className="mt-3 text-sm font-semibold text-destructive">{message}</p>}

      <div className="mt-4 space-y-2">
        {items.length === 0 && (
          <EmptyState
            title={mode === 'store' ? 'Nothing here yet' : 'Nothing owned yet'}
            description={
              mode === 'store'
                ? 'Nothing in this category yet.'
                : 'Buy something in the Shop tab and it lands here, ready to equip.'
            }
          />
        )}
        {items.map((c) => {
          const equipped =
            c.kind === 'theme'
              ? `theme.${themeId}` === c.id
              : store?.equipped[c.kind as 'title' | 'border' | 'banner'] === c.id;
          return (
            <div
              key={c.id}
              className={cn(
                'surface flex items-center gap-3 p-3',
                equipped && 'border-primary bg-primary/5',
              )}
            >
              <span
                className={cn(
                  'shrink-0 rounded-lg',
                  c.kind === 'border' ? 'h-12 w-12 rounded-full' : 'h-12 w-20',
                )}
                style={{ background: c.paint }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{c.label}</p>
                <p className="text-xs text-muted-foreground">
                  {c.free ? 'Free' : c.owned ? 'Owned' : <SparkAmount amount={c.price} size={12} />}
                </p>
              </div>
              {equipped ? (
                <span className="flex items-center gap-1 text-sm font-bold text-primary">
                  <Check size={16} /> Equipped
                </span>
              ) : (
                <Button
                  variant={c.owned ? 'chunkyLight' : 'chunkyGold'}
                  className="w-auto px-4"
                  disabled={!c.owned && (store?.currency ?? 0) < c.price}
                  onClick={() => act(c)}
                >
                  {c.owned ? 'Equip' : (store?.currency ?? 0) < c.price ? <Lock size={16} /> : 'Buy'}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 space-y-2 text-center">
        <p className="text-xs text-muted-foreground">
          Nothing here costs money. Spark is earned by training and finishing quests.
        </p>
        {onQuests && (
          <Button variant="chunkyOutline" className="w-full" onClick={onQuests}>
            <Target size={16} /> Earn more Spark
          </Button>
        )}
      </div>
    </Panel>
  );
}

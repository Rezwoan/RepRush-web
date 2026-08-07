'use client';
/**
 * Store and Inventory (SPEC §9). Same data, two filters: everything, or only
 * what you own — so it is one component with a `mode`.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { profileApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/display';
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
];

export function StorePanel({
  mode,
  onBack,
  onChanged,
}: {
  mode: 'store' | 'inventory';
  onBack: () => void;
  onChanged: () => void;
}) {
  const [store, setStore] = useState<Store | null>(null);
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
      if (c.owned) {
        await profileApi.update({ [`${c.kind}Id`]: c.id });
      } else {
        const res = await profileApi.buy(c.id);
        setStore(res.data);
      }
      await load();
      onChanged();
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'That did not work.');
    }
  };

  const items = (store?.items ?? []).filter(
    (c) => c.kind === kind && (mode === 'store' || c.owned),
  );

  return (
    <Panel
      title={mode === 'store' ? 'Store' : 'Inventory'}
      onBack={onBack}
      action={
        <span className="nums rounded-full bg-secondary px-3 py-1 text-sm font-extrabold">
          {store?.currency ?? 0} 🥚
        </span>
      }
    >
      <Segmented options={KINDS} value={kind} onChange={setKind} />

      {message && <p className="mt-3 text-sm font-semibold text-destructive">{message}</p>}

      <div className="mt-4 space-y-2">
        {items.length === 0 && (
          <EmptyState
            title={mode === 'store' ? 'Nothing here yet' : 'Nothing owned yet'}
            description={
              mode === 'store'
                ? 'New cosmetics land with the gamification pass.'
                : 'Buy something in the Store and it shows up here.'
            }
          />
        )}
        {items.map((c) => {
          const equipped = store?.equipped[c.kind] === c.id;
          return (
            <div
              key={c.id}
              className={cn(
                'surface flex items-center gap-3 p-3',
                equipped && 'border-primary bg-primary/5',
              )}
            >
              <span
                className={cn('shrink-0 rounded-lg', c.kind === 'border' ? 'h-12 w-12 rounded-full' : 'h-12 w-20')}
                style={{ background: c.paint }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{c.label}</p>
                <p className="text-xs text-muted-foreground">
                  {c.free ? 'Free' : c.owned ? 'Owned' : `${c.price} 🥚`}
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

      {mode === 'store' && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Nothing here costs money. Currency is earned by training — awarding it arrives with the
          quest and level system.
        </p>
      )}
    </Panel>
  );
}

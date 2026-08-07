'use client';
/**
 * Creatine and supplements (P13).
 *
 * These are working v1 features that the decision log kept deliberately —
 * they are not nutrition, which was cut — and they became **unreachable** when
 * v1's `/dashboard` stopped being the app's shell. Nothing in the v2 tabs
 * linked to them, and the finish flow's `Consumables` row pointed at `/profile`,
 * which has never had any.
 *
 * So this is a door, not a rewrite: both trackers are v1's components, mounted
 * where the rest of the health data lives.
 */
import { useCallback, useEffect, useState } from 'react';
import { creatineApi } from '@/lib/api';
import CreatineTracker from '@/components/dashboard/creatine-tracker';
import SupplementTracker from '@/components/dashboard/supplement-tracker';
import { Panel } from './panel';

export function ConsumablesPanel({ onBack }: { onBack: () => void }) {
  const [today, setToday] = useState<{ totalGrams: number; logs: any[] }>({ totalGrams: 0, logs: [] });

  const load = useCallback(() => {
    creatineApi
      .getToday()
      .then((r) => setToday(r.data))
      .catch(() => {
        /* offline — an empty day is the honest default, and logging retries */
      });
  }, []);

  useEffect(load, [load]);

  return (
    <Panel title="Consumables" onBack={onBack}>
      <div className="space-y-4 pb-4">
        <CreatineTracker today={today} onLogged={load} />
        <SupplementTracker />
      </div>
    </Panel>
  );
}

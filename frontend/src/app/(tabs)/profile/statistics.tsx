'use client';
/** Statistics (SPEC §9) — Overview, Chronometry, Metrics, Exercise Counter. */
import { useEffect, useState } from 'react';
import { profileApi } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { StatTile } from '@/components/ui/display';
import { Panel } from './panel';
import { hhmm } from './types';

interface Stats {
  overview: {
    joinedAt: string;
    workouts: number;
    favouriteExercise: string | null;
    daysTrained: number;
  };
  chronometry: { averageSec: number; longestSec: number; ratio: number };
  metrics: {
    totalVolume: number;
    averageVolume: number;
    totalReps: number;
    averageReps: number;
    totalSets: number;
  };
  counter: { name: string; sets: number }[];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function StatisticsPanel({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const u = useUnits();

  useEffect(() => {
    profileApi
      .statistics()
      .then((r) => setStats(r.data))
      .catch(() => setStats(null));
  }, []);

  if (!stats) {
    return (
      <Panel title="Statistics" onBack={onBack}>
        <div className="surface h-64 animate-pulse opacity-60" />
      </Panel>
    );
  }

  const n = (v: number) => v.toLocaleString('en-GB');

  return (
    <Panel title="Statistics" onBack={onBack}>
      <Section title="Overview">
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Joined" value={new Date(stats.overview.joinedAt).toLocaleDateString()} />
          <StatTile label="Workouts" value={n(stats.overview.workouts)} />
          <StatTile label="Days trained" value={n(stats.overview.daysTrained)} />
          <StatTile label="Favourite lift" value={stats.overview.favouriteExercise ?? '—'} />
        </div>
      </Section>

      <Section title="Chronometry">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Average" value={hhmm(stats.chronometry.averageSec)} />
          <StatTile label="Longest" value={hhmm(stats.chronometry.longestSec)} />
          <StatTile
            label="Workout ratio"
            value={`${Math.round(stats.chronometry.ratio * 100)}%`}
          />
        </div>
      </Section>

      <Section title="Metrics">
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Total volume" value={u.volume(stats.metrics.totalVolume)} />
          <StatTile label="Per workout" value={u.volume(stats.metrics.averageVolume)} />
          <StatTile label="Total reps" value={n(stats.metrics.totalReps)} />
          <StatTile label="Total sets" value={n(stats.metrics.totalSets)} />
        </div>
      </Section>

      <Section title="Exercise counter">
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {stats.counter.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
          )}
          {stats.counter.map((c) => (
            <div key={c.name} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
              <span className="nums text-sm font-bold text-muted-foreground">{c.sets} sets</span>
            </div>
          ))}
        </div>
      </Section>
    </Panel>
  );
}

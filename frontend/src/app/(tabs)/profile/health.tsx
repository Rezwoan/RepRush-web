'use client';
/**
 * Health Log (SPEC §12.2) — one chart per body metric, plus the entry list.
 *
 * Bodyweight reads and writes `body_weight_logs`, everything else the new
 * `health_logs` table; the backend hides that seam so this screen sees one
 * shape. See the comment on the `HealthLog` entity for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { profileApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/display';
import { useUnits } from '@/lib/units';
import { cn } from '@/lib/utils';
import { METRIC_LABEL, metricToDisplay, metricToStored, metricUnit } from './types';
import { Panel } from './panel';

interface Entry {
  id: number;
  value: number;
  date: string;
  metric: string;
}

/**
 * A filled area chart, drawn from the points themselves — no chart library.
 *
 * Every point is a target: a chart of your bodyweight that cannot tell you what
 * you weighed and when is a decoration. Tapping one reads it out; the last
 * entry is selected on open, so the chart always says something.
 *
 * The dots sit in their own overlay rather than in the stretched `viewBox`,
 * because `preserveAspectRatio="none"` is what lets the line fill the box and
 * it would squash a circle into an ellipse.
 */
function Chart({
  points,
  format,
}: {
  points: Entry[];
  format: (value: number) => string;
}) {
  const [picked, setPicked] = useState<number | null>(null);

  // A new metric is a new set of points; an index into the old one is noise.
  useEffect(() => setPicked(null), [points]);

  if (points.length < 2) {
    return (
      <div className="grid h-40 place-items-center rounded-2xl bg-muted/40">
        <span className="rounded-full bg-card px-3 py-1 text-sm font-bold text-muted-foreground">
          {points.length ? `One entry so far — ${format(points[0].value)} on ${points[0].date}` : 'No data yet'}
        </span>
      </div>
    );
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xy = points.map((p, i) => ({
    x: (i / (points.length - 1)) * 100,
    y: 100 - ((p.value - min) / span) * 80 - 10,
  }));
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const at = picked ?? points.length - 1;
  const selected = points[at];

  return (
    <div className="rounded-2xl bg-muted/40 p-3">
      <div className="relative h-40 w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <path d={`${line} L100,100 L0,100 Z`} fill="hsl(var(--primary) / 0.18)" stroke="none" />
          <path
            d={line}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={xy[at].x}
            x2={xy[at].x}
            y1={0}
            y2={100}
            stroke="hsl(var(--primary) / 0.45)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {points.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setPicked(i)}
            aria-label={`${p.date}: ${format(p.value)}`}
            aria-pressed={i === at}
            className="press absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center"
            style={{ left: `${xy[i].x}%`, top: `${xy[i].y}%` }}
          >
            <span
              className={cn(
                'block rounded-full border-2 border-card bg-primary transition-all',
                i === at ? 'h-3.5 w-3.5' : 'h-2 w-2',
              )}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="nums text-lg font-extrabold">{format(selected.value)}</span>
        <span className="nums text-sm text-muted-foreground">{selected.date}</span>
        <span className="flex-1" />
        <span className="nums text-xs text-muted-foreground">
          {format(min)} – {format(max)}
        </span>
      </div>
    </div>
  );
}

export function HealthPanel({ onBack }: { onBack: () => void }) {
  const [metric, setMetric] = useState('bodyweight');
  const u = useUnits();
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  const load = useCallback(async (m: string) => {
    setRows(null);
    try {
      const res = await profileApi.health(m);
      setRows(res.data);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load(metric);
  }, [metric, load]);

  const add = async () => {
    // Typed in the displayed unit; stored metric, like every other measurement.
    const v = metricToStored(metric, parseFloat(value), u);
    if (!(v > 0)) return;
    try {
      const res = await profileApi.logHealth(metric, v, date);
      setRows(res.data);
      setValue('');
      setAdding(false);
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not save that.');
    }
  };

  const unit = metricUnit(metric, u);

  return (
    <Panel
      title="Health"
      onBack={onBack}
      action={
        <button onClick={() => setAdding(true)} aria-label="Add entry" className="press text-primary">
          <Plus size={24} />
        </button>
      }
    >
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {Object.keys(METRIC_LABEL).map((m) => (
          <Chip key={m} active={metric === m} onClick={() => setMetric(m)}>
            {METRIC_LABEL[m]}
          </Chip>
        ))}
      </div>

      <h2 className="mb-2 font-extrabold">{METRIC_LABEL[metric]} chart</h2>
      <Chart
        points={rows ?? []}
        format={(v) => `${Math.round(metricToDisplay(metric, v, u) * 10) / 10} ${unit}`}
      />

      <h2 className="mb-2 mt-5 font-extrabold">Data entries</h2>
      {rows?.length === 0 && (
        <EmptyState
          title="Nothing logged yet"
          description={`Tap + to record your first ${METRIC_LABEL[metric].toLowerCase()} entry.`}
        />
      )}
      <div className="space-y-2">
        {(rows ?? [])
          .slice()
          .reverse()
          .map((r) => (
            <div key={r.id} className="surface flex items-center gap-3 p-3">
              <span className="nums flex-1 font-extrabold">
                {Math.round(metricToDisplay(metric, r.value, u) * 10) / 10} {unit}
              </span>
              <span className="nums text-sm text-muted-foreground">{r.date}</span>
              <button
                aria-label="Delete entry"
                className="press text-muted-foreground"
                onClick={async () => {
                  const res = await profileApi.deleteHealth(metric, r.id).catch(() => null);
                  if (res) setRows(res.data);
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
      </div>

      <Sheet open={adding} onOpenChange={setAdding} title={`Log ${METRIC_LABEL[metric].toLowerCase()}`}>
        <div className="space-y-3 pb-2">
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="nums w-full rounded-2xl border-2 border-border bg-card px-4 py-3 text-2xl font-extrabold outline-none focus:border-primary"
            />
            <span className="font-bold text-muted-foreground">{unit}</span>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
          />
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          <Button variant="chunky" size="cta" onClick={add} disabled={!(parseFloat(value) > 0)}>
            Save entry
          </Button>
        </div>
      </Sheet>
    </Panel>
  );
}

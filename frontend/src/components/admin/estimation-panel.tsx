'use client';
import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Target, Activity, Scale, TrendingUp, TrendingDown, Gauge, FlaskConical, ArrowRight } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui/card';
import { Item, Stagger } from '@/components/ui/motion-primitives';

const TT = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 };
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '');

export default function EstimationPanel() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { adminApi.getEstimation().then((r) => setData(r.data)).catch(() => {}); }, []);

  if (!data) return <div className="flex items-center justify-center h-48"><div className="loader-ring" /></div>;

  const retro = data.retro || { count: 0 };
  const live = data.live || { count: 0 };

  const biasLabel = retro.bias > 0
    ? `Members lift ${retro.bias}kg more than predicted (algorithm runs light)`
    : retro.bias < 0
      ? `Members lift ${Math.abs(retro.bias)}kg less than predicted (algorithm runs heavy)`
      : 'No directional bias';

  const delta = (predicted: number, actual: number) => {
    const e = Math.round((actual - predicted) * 10) / 10;
    const within = Math.abs(actual - predicted) <= Math.max(2.5, actual * 0.05);
    const color = within ? 'text-success' : e > 0 ? 'text-volt-400' : 'text-destructive';
    return <span className={`nums font-semibold ${color}`}>{e > 0 ? '+' : ''}{e}kg</span>;
  };

  return (
    <div className="space-y-5">
      {/* Explainer */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-3.5">
        <FlaskConical size={16} className="text-brand-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-brand-200">
          The estimation algorithm is <strong>unchanged</strong>. This tab measures how accurate it currently is so we can
          decide future tuning from real data. <span className="text-brand-400/80">“Accuracy” = prediction within ±2.5&nbsp;kg (or 5%) of what was actually lifted.</span>
        </p>
      </div>

      {/* ── Retrospective accuracy ── */}
      <Card className="p-5">
        <CardHeader icon={<Target size={16} />} title="Algorithm accuracy"
          action={<span className="text-xs text-muted-foreground">replayed over history</span>} />
        {retro.count === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Not enough repeat sessions yet. Once members log the same exercise across multiple sessions, accuracy appears here.</p>
        ) : (
          <>
            <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
              <Kpi icon={<Activity size={14} />} label="Predictions" value={retro.count} />
              <Kpi icon={<Gauge size={14} />} label="Accuracy" value={`${retro.accuracy}%`} accent="success" />
              <Kpi icon={<Scale size={14} />} label="Mean error" value={`${retro.meanAbsError}kg`} />
              <Kpi icon={retro.bias >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} label="Bias" value={`${retro.bias > 0 ? '+' : ''}${retro.bias}kg`} accent="volt" />
            </Stagger>
            <p className="text-xs text-muted-foreground mb-4">{biasLabel}.</p>

            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Error distribution (actual − predicted)</p>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={retro.buckets} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                <Tooltip contentStyle={TT} cursor={{ fill: 'hsl(var(--secondary) / 0.4)' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {retro.buckets.map((b: any, i: number) => (
                    <Cell key={i} fill={b.label === 'spot on' || b.label === '-2.5…0' || b.label === '0…2.5' ? '#34d399' : i < 3 ? '#f87171' : '#faba0c'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Per-exercise */}
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">By exercise</p>
              <div className="space-y-1">
                {retro.perExercise.slice(0, 10).map((e: any) => (
                  <div key={e.exercise} className="flex items-center gap-3 text-sm py-1">
                    <span className="flex-1 truncate">{e.exercise}</span>
                    <span className="text-xs text-muted-foreground nums w-10 text-right">n={e.n}</span>
                    <span className={`text-xs nums w-14 text-right ${e.bias > 0 ? 'text-volt-400' : e.bias < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{e.bias > 0 ? '+' : ''}{e.bias}kg</span>
                    <span className={`text-xs font-semibold nums w-12 text-right ${e.accuracy >= 70 ? 'text-success' : e.accuracy >= 40 ? 'text-volt-400' : 'text-destructive'}`}>{e.accuracy}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Samples */}
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent predictions vs actual</p>
              <div className="space-y-1">
                {retro.samples.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1 border-b border-border/50 last:border-0">
                    <span className="text-xs text-muted-foreground w-12 nums flex-shrink-0">{fmtDate(s.date)}</span>
                    <span className="flex-1 min-w-0 truncate">{s.exercise} <span className="text-muted-foreground">· {s.user}</span></span>
                    <span className="text-xs nums text-muted-foreground flex items-center gap-1">{s.predicted}<ArrowRight size={10} />{s.actual}kg</span>
                    {delta(s.predicted, s.actual)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      {/* ── Live suggestion tracking ── */}
      <Card className="p-5">
        <CardHeader accent="volt" icon={<Activity size={16} />} title="Live suggestion tracking"
          action={<span className="text-xs text-muted-foreground">collected from now on</span>} />
        {live.count === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Collecting… Every working set now records the suggested weight shown. As members train, you’ll see here how often they keep the
            suggestion vs. override it.
          </p>
        ) : (
          <>
            <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
              <Kpi icon={<Activity size={14} />} label="Logged" value={live.count} />
              <Kpi icon={<Gauge size={14} />} label="Kept as-is" value={`${live.kept}%`} accent="success" />
              <Kpi icon={<TrendingUp size={14} />} label="Increased" value={`${live.increased}%`} accent="volt" />
              <Kpi icon={<TrendingDown size={14} />} label="Decreased" value={`${live.decreased}%`} />
            </Stagger>
            <p className="text-xs text-muted-foreground mb-4">
              Accuracy {live.accuracy}% · mean override {live.meanOverride > 0 ? '+' : ''}{live.meanOverride}kg vs suggestion.
            </p>
            <div className="space-y-1">
              {live.samples.map((s: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm py-1 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground w-12 nums flex-shrink-0">{fmtDate(s.date)}</span>
                  <span className="flex-1 min-w-0 truncate">{s.exercise} <span className="text-muted-foreground">· {s.user}</span></span>
                  <span className="text-xs nums text-muted-foreground flex items-center gap-1">{s.suggested}<ArrowRight size={10} />{s.actual}kg</span>
                  {delta(s.suggested, s.actual)}
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: any; accent?: 'volt' | 'success' }) {
  const c = accent === 'volt' ? 'text-volt-400' : accent === 'success' ? 'text-success' : 'text-brand-400';
  return (
    <Item>
      <div className="rounded-xl border border-border bg-secondary/30 p-3">
        <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide ${c}`}>{icon}{label}</div>
        <p className="text-xl font-display font-bold nums mt-1">{value}</p>
      </div>
    </Item>
  );
}

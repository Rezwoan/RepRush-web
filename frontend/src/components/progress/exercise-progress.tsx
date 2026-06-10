'use client';
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { LineChart as LineIcon, Trophy } from 'lucide-react';
import { workoutsApi } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui/card';

const TT = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 };

export default function ExerciseProgress() {
  const [exercises, setExercises] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [metric, setMetric] = useState<'e1rm' | 'topWeight'>('e1rm');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    workoutsApi.getExercises().then((r) => {
      setExercises(r.data || []);
      if (r.data?.length) setSelected(r.data[0].name);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    setLoading(true);
    workoutsApi.getExerciseHistory(selected).then((r) => setHistory(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, [selected]);

  const prCount = history.filter((p) => p.isPR).length;
  const best = history.reduce((m, p) => Math.max(m, p.topWeight), 0);
  const latest = history.length ? history[history.length - 1] : null;
  const dataKey = metric;

  // Highlight PR points
  const renderDot = (p: any) => {
    const { cx, cy, payload, index } = p;
    const k = `d-${index}`;
    if (cx == null) return <g key={k} />;
    if (payload.isPR) return <circle key={k} cx={cx} cy={cy} r={4} fill="#faba0c" stroke="hsl(var(--card))" strokeWidth={1.5} />;
    return history.length <= 8 ? <circle key={k} cx={cx} cy={cy} r={2.5} fill="#0a80f5" /> : <g key={k} />;
  };

  return (
    <Card className="p-5">
      <CardHeader icon={<LineIcon size={16} />} title="Exercise progress"
        action={exercises.length > 0 ? (
          <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
            {(['e1rm', 'topWeight'] as const).map((m) => (
              <button key={m} onClick={() => setMetric(m)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${metric === m ? 'bg-card text-foreground shadow' : 'text-muted-foreground'}`}>
                {m === 'e1rm' ? 'Est. 1RM' : 'Top weight'}
              </button>
            ))}
          </div>
        ) : undefined} />

      {exercises.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Log a few workouts to see per-exercise progress here.</p>
      ) : (
        <>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="field !py-2 text-sm mb-4">
            {exercises.map((e) => (
              <option key={e.name} value={e.name}>{e.name} · {e.sessions} session{e.sessions !== 1 ? 's' : ''}</option>
            ))}
          </select>

          {loading ? (
            <div className="h-44 flex items-center justify-center"><div className="loader-ring" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No data for this exercise yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2.5 mb-4">
                <Mini label="Best weight" value={`${best}kg`} />
                <Mini label={metric === 'e1rm' ? 'Latest 1RM' : 'Latest top'} value={`${latest ? latest[dataKey] : 0}kg`} />
                <Mini label="PRs" value={String(prCount)} icon={prCount > 0} />
              </div>
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={history} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="exg" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3b97f5" /><stop offset="100%" stopColor="#0a80f5" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} unit="kg" />
                  <Tooltip contentStyle={TT} formatter={(v: any, n: any, p: any) => [`${v} kg${p.payload.isPR ? ' · PR 🏆' : ''}`, metric === 'e1rm' ? 'Est. 1RM' : 'Top weight']}
                    labelFormatter={(l) => l} />
                  <Line type="monotone" dataKey={dataKey} stroke="url(#exg)" strokeWidth={2.5} dot={renderDot} activeDot={{ r: 5, fill: '#0a80f5' }} />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5"><Trophy size={11} className="text-volt-400" /> Gold dots mark a new weight PR.</p>
            </>
          )}
        </>
      )}
    </Card>
  );
}

function Mini({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
      <p className="text-base font-display font-bold nums flex items-center justify-center gap-1">
        {icon && <Trophy size={13} className="text-volt-400" />}{value}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">{label}</p>
    </div>
  );
}

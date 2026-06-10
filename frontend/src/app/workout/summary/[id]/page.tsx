'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Trophy, Dumbbell, Clock, Layers, TrendingUp, TrendingDown, Home, Flame } from 'lucide-react';
import { workoutsApi } from '@/lib/api';
import { PageTransition, Stagger, Item } from '@/components/ui/motion-primitives';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { spring } from '@/lib/motion';

const fmtDur = (s?: number | null) => {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

export default function SessionSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    workoutsApi.getSessionSummary(parseInt(id)).then((r) => setD(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="loader-ring" /></div>;
  if (!d) return <div className="text-center py-20 text-muted-foreground">Summary not found.</div>;

  return (
    <PageTransition className="max-w-lg mx-auto space-y-5 pb-8">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring.bouncy} className="text-center pt-4">
        <motion.div
          initial={{ rotate: -12, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ ...spring.bouncy, delay: 0.1 }}
          className="w-16 h-16 mx-auto rounded-2xl bg-success/15 text-success flex items-center justify-center mb-3">
          <Trophy size={30} />
        </motion.div>
        <h1 className="text-2xl font-display font-extrabold">Session complete!</h1>
        <p className="text-sm text-muted-foreground mt-1">{d.workoutType || 'Workout'} · {fmtDur(d.durationSec)}</p>
      </motion.div>

      {/* Key stats */}
      <Stagger className="grid grid-cols-3 gap-3">
        <Item><Stat icon={<Dumbbell size={16} />} label="Volume" value={<><AnimatedNumber value={d.totalVolume} /><span className="text-xs text-muted-foreground">kg</span></>} accent="volt" /></Item>
        <Item><Stat icon={<Layers size={16} />} label="Sets" value={<AnimatedNumber value={d.totalSets} />} accent="brand" /></Item>
        <Item><Stat icon={<Clock size={16} />} label="Duration" value={fmtDur(d.durationSec)} accent="success" small /></Item>
      </Stagger>

      {/* PRs hit */}
      {d.prsHit?.length > 0 && (
        <Item standalone>
          <Card className="p-5 border-volt-400/30 bg-volt-400/[0.05]">
            <div className="flex items-center gap-2 mb-3">
              <Flame size={16} className="text-volt-400" />
              <h2 className="font-display font-bold text-volt-400">New personal record{d.prsHit.length > 1 ? 's' : ''}! 🎉</h2>
            </div>
            <div className="space-y-2">
              {d.prsHit.map((pr: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08 }}
                  className="flex items-center justify-between text-sm">
                  <span className="font-medium">{pr.name}</span>
                  <span className="nums font-bold text-volt-400">{pr.weightKg} kg</span>
                </motion.div>
              ))}
            </div>
          </Card>
        </Item>
      )}

      {/* vs last */}
      {d.vsLast && (
        <Item standalone>
          <Card className="p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">vs your last {d.workoutType}</p>
            <div className="grid grid-cols-2 gap-3">
              <Delta label="Volume" value={d.vsLast.volumeDelta} unit="kg" />
              <Delta label="Sets" value={d.vsLast.setsDelta} unit="" />
            </div>
          </Card>
        </Item>
      )}

      {/* Per-exercise breakdown */}
      <Item standalone>
        <Card className="p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Exercises</p>
          <div className="space-y-2">
            {d.exercises.map((e: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="flex-1 truncate">{e.name}</span>
                <span className="text-xs text-muted-foreground nums">{e.sets} sets</span>
                <span className="text-xs nums w-16 text-right">{e.topWeight}kg top</span>
                <span className="text-xs text-muted-foreground nums w-20 text-right">{e.volume.toLocaleString()}kg vol</span>
              </div>
            ))}
          </div>
        </Card>
      </Item>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => router.push('/achievements')}><TrendingUp size={16} /> View progress</Button>
        <Button className="flex-1" onClick={() => router.push('/dashboard')}><Home size={16} /> Done</Button>
      </div>
    </PageTransition>
  );
}

function Stat({ icon, label, value, accent, small }: { icon: React.ReactNode; label: string; value: any; accent: 'brand' | 'volt' | 'success'; small?: boolean }) {
  const c = accent === 'volt' ? 'text-volt-400' : accent === 'success' ? 'text-success' : 'text-brand-400';
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-center">
      <div className={`flex justify-center mb-1.5 ${c}`}>{icon}</div>
      <p className={`font-display font-extrabold nums ${small ? 'text-base' : 'text-2xl'}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function Delta({ label, value, unit }: { label: string; value: number; unit: string }) {
  const up = value > 0, flat = value === 0;
  const color = flat ? 'text-muted-foreground' : up ? 'text-success' : 'text-destructive';
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={`font-display font-bold nums flex items-center gap-1 ${color}`}>
        {!flat && (up ? <TrendingUp size={15} /> : <TrendingDown size={15} />)}
        {up ? '+' : ''}{value.toLocaleString()}{unit}
      </p>
    </div>
  );
}

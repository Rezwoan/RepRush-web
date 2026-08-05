'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, Dumbbell, Trophy, Clock, ChevronRight, Layers, Flame, CalendarDays,
} from 'lucide-react';
import { workoutsApi } from '@/lib/api';
import { PageTransition, Stagger, Item } from '@/components/ui/motion-primitives';
import { Card, CardHeader } from '@/components/ui/card';
import ExerciseProgress from '@/components/progress/exercise-progress';
import { formatDate, getWorkoutTypeColor } from '@/lib/utils';
import { spring } from '@/lib/motion';

interface SessionRow {
  id: number;
  workoutType: string;
  date: string;
  startedAt: string;
  durationSec: number | null;
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  exerciseCount: number;
  exercises: { name: string; sets: number; topWeight: number; volume: number }[];
  prs: string[];
  notes: string | null;
}

const TT = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 };
const ALL = 'All';

const fmtDuration = (sec: number | null) => {
  if (!sec) return '—';
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
const fmtVolume = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${kg}kg`);

export default function ProgressPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<string>(ALL);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    workoutsApi.getSessionHistory()
      .then((r) => setRows(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const types = useMemo(
    () => [ALL, ...Array.from(new Set(rows.map((r) => r.workoutType))).sort()],
    [rows],
  );
  const filtered = useMemo(
    () => (type === ALL ? rows : rows.filter((r) => r.workoutType === type)),
    [rows, type],
  );

  // Chart wants oldest → newest; the API hands us newest first.
  const chartData = useMemo(
    () => [...filtered].reverse().map((r) => ({
      date: r.date,
      volume: r.totalVolume,
      sets: r.totalSets,
    })),
    [filtered],
  );

  const totals = useMemo(() => {
    const volume = filtered.reduce((a, r) => a + r.totalVolume, 0);
    const sets = filtered.reduce((a, r) => a + r.totalSets, 0);
    const prs = filtered.reduce((a, r) => a + r.prs.length, 0);
    return { sessions: filtered.length, volume, sets, prs };
  }, [filtered]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="loader-ring" /></div>;
  }

  return (
    <PageTransition className="max-w-2xl mx-auto pb-28 lg:pb-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold">Progress</h1>
          <p className="text-sm text-muted-foreground">Every session you&apos;ve completed, and how the numbers moved.</p>
        </div>
        {/* Mobile nav has no room for a 6th tab — keep badges reachable from here. */}
        <button
          onClick={() => router.push('/achievements')}
          className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors flex-shrink-0 mt-1"
        >
          <Trophy size={13} /> Badges
        </button>
      </div>

      {rows.length === 0 ? (
        <Card className="p-8 text-center">
          <Dumbbell size={28} className="mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No completed sessions yet. Finish a workout and it&apos;ll show up here.
          </p>
        </Card>
      ) : (
        <>
          {/* Workout-type filter */}
          {types.length > 2 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-4 pb-0.5">
              {types.map((t) => (
                <button
                  key={t}
                  onClick={() => { setType(t); setOpen(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    type === t ? 'bg-brand-500 text-white' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <Stat label="Sessions" value={String(totals.sessions)} icon={<CalendarDays size={13} />} />
            <Stat label="Volume" value={fmtVolume(totals.volume)} icon={<Layers size={13} />} />
            <Stat label="Sets" value={String(totals.sets)} icon={<Dumbbell size={13} />} />
            <Stat label="PRs" value={String(totals.prs)} icon={<Trophy size={13} />} gold />
          </div>

          {/* Volume trend */}
          {chartData.length > 1 && (
            <Card className="p-5 mb-4">
              <CardHeader icon={<TrendingUp size={16} />} title="Volume per session" />
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="volg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0a80f5" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#0a80f5" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} interval="preserveStartEnd" minTickGap={26} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={52} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}t` : v)} />
                  <Tooltip contentStyle={TT} formatter={(v: any) => [`${v} kg`, 'Volume']} />
                  <Area type="monotone" dataKey="volume" stroke="#0a80f5" strokeWidth={2.5} fill="url(#volg)" />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-muted-foreground mt-2">
                Volume = weight × reps across working sets. Warm-ups excluded.
              </p>
            </Card>
          )}

          {/* Session history */}
          <Card className="p-5 mb-4">
            <CardHeader icon={<Layers size={16} />} title={`Session history · ${filtered.length}`} />
            <Stagger className="space-y-2">
              {filtered.map((s) => {
                const isOpen = open === s.id;
                return (
                  <Item key={s.id}>
                    <div className="rounded-xl border border-border bg-secondary/25 overflow-hidden">
                      <button
                        onClick={() => setOpen(isOpen ? null : s.id)}
                        className="w-full flex items-center gap-3 p-3 text-left"
                      >
                        <span
                          className="w-1.5 h-9 rounded-full flex-shrink-0"
                          style={{ background: getWorkoutTypeColor(s.workoutType) }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                            {s.workoutType}
                            {s.prs.length > 0 && <Trophy size={12} className="text-volt-400 flex-shrink-0" />}
                          </p>
                          <p className="text-[11px] text-muted-foreground nums">
                            {formatDate(s.startedAt)} · {s.exerciseCount} exercises · {s.totalSets} sets
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-display font-bold nums">{fmtVolume(s.totalVolume)}</p>
                          <p className="text-[10px] text-muted-foreground nums flex items-center gap-1 justify-end">
                            <Clock size={9} />{fmtDuration(s.durationSec)}
                          </p>
                        </div>
                        <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={spring.snappy} className="text-muted-foreground flex-shrink-0">
                          <ChevronRight size={16} />
                        </motion.span>
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3 space-y-1.5">
                              {s.exercises.map((ex) => (
                                <div key={ex.name} className="flex items-center gap-2 text-xs">
                                  <span className="flex-1 truncate text-muted-foreground flex items-center gap-1.5">
                                    {s.prs.includes(ex.name) && <Trophy size={10} className="text-volt-400 flex-shrink-0" />}
                                    {ex.name}
                                  </span>
                                  <span className="nums text-muted-foreground/70">{ex.sets}×</span>
                                  <span className="nums font-semibold w-16 text-right">{ex.topWeight} kg</span>
                                  <span className="nums text-muted-foreground/70 w-16 text-right">{fmtVolume(ex.volume)}</span>
                                </div>
                              ))}
                              {s.notes && (
                                <p className="text-[11px] text-muted-foreground/70 italic pt-1.5 border-t border-border/60 mt-2">
                                  {s.notes}
                                </p>
                              )}
                              <button
                                onClick={() => router.push(`/workout/summary/${s.id}`)}
                                className="text-[11px] text-brand-400 hover:text-brand-300 transition-colors pt-1.5 flex items-center gap-1"
                              >
                                <Flame size={11} /> Open full summary
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </Item>
                );
              })}
            </Stagger>
          </Card>

          <ExerciseProgress />
        </>
      )}
    </PageTransition>
  );
}

function Stat({ label, value, icon, gold }: { label: string; value: string; icon: React.ReactNode; gold?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-2.5 text-center">
      <p className={`text-base font-display font-bold nums flex items-center justify-center gap-1 ${gold ? 'text-volt-400' : ''}`}>
        <span className={gold ? 'text-volt-400' : 'text-brand-400'}>{icon}</span>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">{label}</p>
    </div>
  );
}

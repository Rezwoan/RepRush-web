'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Dumbbell, Flame, Calendar, TrendingUp, Weight, Activity, ArrowRight,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useAuth } from '@/lib/auth-context';
import { workoutsApi, creatineApi, bodyWeightApi, supplementsApi } from '@/lib/api';
import HeatmapCalendar from '@/components/dashboard/heatmap-calendar';
import CreatineTracker from '@/components/dashboard/creatine-tracker';
import SupplementTracker from '@/components/dashboard/supplement-tracker';
import OnboardingBanner from '@/components/layout/onboarding-banner';
import { PageTransition, Stagger, Item } from '@/components/ui/motion-primitives';
import { Card, CardHeader } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

const CHART = { tooltip: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12 } };

export default function DashboardPage() {
  const { user } = useAuth();
  const [heatmapData, setHeatmapData] = useState<Record<string, any>>({});
  const [creatineToday, setCreatineToday] = useState<{ totalGrams: number; logs: any[] }>({ totalGrams: 0, logs: [] });
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [bodyWeightHistory, setBodyWeightHistory] = useState<any[]>([]);
  const [prs, setPRs] = useState<any[]>([]);
  const [supplementHeatmap, setSupplementHeatmap] = useState<Record<string, any>>({});

  const year = new Date().getFullYear();

  useEffect(() => {
    Promise.all([
      workoutsApi.getHeatmap(year).then((r) => setHeatmapData(r.data)),
      creatineApi.getToday().then((r) => setCreatineToday(r.data)),
      workoutsApi.getSessions().then((r) => setRecentSessions(r.data.slice(0, 5))),
      bodyWeightApi.getHistory(60).then((r) => setBodyWeightHistory(r.data)),
      workoutsApi.getPRs().then((r) => setPRs(r.data)),
      supplementsApi.getHeatmap(year).then((r) => setSupplementHeatmap(r.data)),
    ]).catch(() => {});
  }, [year]);

  const refreshSupplementHeatmap = () => supplementsApi.getHeatmap(year).then((r) => setSupplementHeatmap(r.data)).catch(() => {});

  const totalDays = Object.keys(heatmapData).length;
  const currentStreak = computeStreak(heatmapData);
  const correlationData = buildCorrelationData(bodyWeightHistory, prs);

  return (
    <PageTransition className="space-y-5 max-w-4xl mx-auto">
      <OnboardingBanner />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
        className="flex items-end justify-between gap-3"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-brand-400">{getGreeting()}</p>
          <h1 className="text-2xl lg:text-3xl font-display font-extrabold tracking-tight mt-0.5">
            {user?.name?.split(' ')[0] || 'Lifter'}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link href="/workout">
          <Button size="lg" className="shadow-glow-brand">
            <Dumbbell size={16} />
            Start
          </Button>
        </Link>
      </motion.div>

      {/* Stats */}
      <Stagger className="grid grid-cols-3 gap-3">
        <StatCard icon={<Calendar size={18} />} label="Sessions this year" accent="brand"
          value={<AnimatedNumber value={totalDays} />} />
        <StatCard icon={<Flame size={18} />} label="Current streak" accent="volt"
          value={<AnimatedNumber value={currentStreak} suffix="d" />} />
        <StatCard icon={<Activity size={18} />} label="Creatine today" accent="success"
          value={<AnimatedNumber value={creatineToday.totalGrams} suffix="g" />} />
      </Stagger>

      {/* Heatmap */}
      <Item standalone>
        <Card className="p-5" interactive>
          <CardHeader
            icon={<TrendingUp size={16} />}
            title="Training Calendar"
            action={<span className="text-xs text-muted-foreground">{totalDays} total sessions</span>}
          />
          <HeatmapCalendar data={heatmapData} year={year} supplementData={supplementHeatmap} />
        </Card>
      </Item>

      {/* Body weight */}
      {bodyWeightHistory.length >= 1 && (
        <Item standalone>
          <Card className="p-5" interactive>
            <CardHeader
              icon={<Weight size={16} />}
              title="Body Weight"
              action={<span className="text-xs text-muted-foreground">Last 60 days</span>}
            />
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={bodyWeightHistory} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="bw" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3b97f5" />
                    <stop offset="100%" stopColor="#0a80f5" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip contentStyle={CHART.tooltip} labelStyle={{ color: 'hsl(var(--muted-foreground))' }} itemStyle={{ color: '#3b97f5' }} formatter={(v: any) => [`${v} kg`, 'Weight']} />
                <Line type="monotone" dataKey="weightKg" stroke="url(#bw)" strokeWidth={2.5}
                  dot={bodyWeightHistory.length <= 4 ? { r: 4, fill: '#0a80f5', strokeWidth: 0 } : false}
                  activeDot={{ r: 5, fill: '#0a80f5' }} />
              </LineChart>
            </ResponsiveContainer>
            <BodyWeightEntry onLogged={() => bodyWeightApi.getHistory(60).then((r) => setBodyWeightHistory(r.data))} />
          </Card>
        </Item>
      )}

      {/* Strength vs body weight */}
      {correlationData.length > 2 && (
        <Item standalone>
          <Card className="p-5" interactive>
            <CardHeader
              accent="volt"
              icon={<TrendingUp size={16} />}
              title="Strength vs Body Weight"
              action={<span className="text-xs text-muted-foreground">Correlation</span>}
            />
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={correlationData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip contentStyle={CHART.tooltip} labelStyle={{ color: 'hsl(var(--muted-foreground))' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }} />
                <Line yAxisId="left" type="monotone" dataKey="bodyWeight" stroke="#3b97f5" strokeWidth={2} dot={false} name="Body (kg)" />
                <Line yAxisId="right" type="monotone" dataKey="strength1RM" stroke="#faba0c" strokeWidth={2.5} dot={false} name="Est. 1RM (kg)" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Item>
      )}

      {/* Prompt to log weight */}
      {bodyWeightHistory.length === 0 && (
        <Item standalone>
          <Card className="p-5">
            <CardHeader icon={<Weight size={16} />} title="Body Weight Tracker" />
            <p className="text-sm text-muted-foreground mb-3">Log your daily weight to track progress and see strength correlations.</p>
            <BodyWeightEntry onLogged={() => bodyWeightApi.getHistory(60).then((r) => setBodyWeightHistory(r.data))} />
          </Card>
        </Item>
      )}

      {/* Creatine — kept front; most common, daily must */}
      <Item standalone>
        <CreatineTracker today={creatineToday} onLogged={() => { creatineApi.getToday().then((r) => setCreatineToday(r.data)); refreshSupplementHeatmap(); }} />
      </Item>

      {/* Other supplements */}
      <Item standalone>
        <SupplementTracker onChange={refreshSupplementHeatmap} />
      </Item>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <Item standalone>
          <Card className="p-5">
            <CardHeader
              title="Recent Sessions"
              action={
                <Link href="/workout" className="text-brand-400 text-xs hover:text-brand-300 transition-colors flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              }
            />
            <div className="space-y-1.5">
              {recentSessions.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring.soft, delay: i * 0.05 }}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors hover:bg-secondary/60"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.workoutType || 'Workout'}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.startedAt).toLocaleDateString('en-GB')} · {s.sets?.length || 0} sets
                    </p>
                  </div>
                  {s.completedAt ? (
                    <span className="text-xs text-success font-medium bg-success/10 px-2.5 py-1 rounded-full">Done</span>
                  ) : (
                    <Link href={`/workout/session/${s.id}`} className="text-xs text-volt-400 font-medium bg-volt-400/10 px-2.5 py-1 rounded-full hover:bg-volt-400/20 transition-colors">
                      Continue
                    </Link>
                  )}
                </motion.div>
              ))}
            </div>
          </Card>
        </Item>
      )}
    </PageTransition>
  );
}

function BodyWeightEntry({ onLogged }: { onLogged: () => void }) {
  const [weight, setWeight] = useState('');
  const [logging, setLogging] = useState(false);

  const handleLog = async () => {
    if (!weight) return;
    setLogging(true);
    try {
      await bodyWeightApi.log(parseFloat(weight));
      setWeight('');
      onLogged();
    } catch (e) { console.error(e); }
    finally { setLogging(false); }
  };

  return (
    <div className="flex gap-2 mt-3">
      <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Today's weight (kg)" step="0.1" className="field flex-1" />
      <Button onClick={handleLog} disabled={!weight || logging} variant="secondary">
        {logging ? 'Logging…' : 'Log'}
      </Button>
    </div>
  );
}

function computeStreak(data: Record<string, any>): number {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if (data[key]) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function buildCorrelationData(bwHistory: any[], prs: any[]): any[] {
  if (!bwHistory.length || !prs.length) return [];
  const prsByDate: Record<string, number> = {};
  prs.forEach((pr) => {
    const d = pr.date || pr.createdAt?.split('T')[0];
    if (!d) return;
    const existing1rm = prsByDate[d] || 0;
    const new1rm = pr.weightKg * (1 + pr.reps / 30);
    if (new1rm > existing1rm) prsByDate[d] = new1rm;
  });
  const prDates = Object.keys(prsByDate).sort();
  if (!prDates.length) return [];
  return bwHistory.map((bw) => {
    const date = bw.date;
    let strength1RM: number | undefined;
    for (let i = prDates.length - 1; i >= 0; i--) {
      if (prDates[i] <= date) { strength1RM = Math.round(prsByDate[prDates[i]]); break; }
    }
    return { date, bodyWeight: bw.weightKg, strength1RM };
  }).filter((d) => d.strength1RM !== undefined);
}

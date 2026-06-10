'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Lock, CheckCircle2, TrendingUp, Weight, Dumbbell, Plus, Trash2, Pencil, Trophy,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { goalsApi, bodyWeightApi, workoutsApi, achievementsApi, exercisesApi } from '@/lib/api';
import { epley1RM } from '@/lib/utils';
import { PageTransition, Stagger, Item } from '@/components/ui/motion-primitives';
import { Card, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

const CHART_TOOLTIP = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12 };
const todayStr = () => new Date().toISOString().split('T')[0];

export default function ProgressPage() {
  const [goals, setGoals] = useState<any[]>([]);
  const [weights, setWeights] = useState<any[]>([]);
  const [prs, setPRs] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [programExercises, setProgramExercises] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGoals = useCallback(() => goalsApi.list().then((r) => setGoals(r.data)).catch(() => {}), []);
  const loadWeights = useCallback(() => bodyWeightApi.getHistory(180).then((r) => setWeights(r.data)).catch(() => {}), []);

  useEffect(() => {
    Promise.all([
      loadGoals(),
      loadWeights(),
      workoutsApi.getPRs().then((r) => setPRs(r.data)).catch(() => {}),
      achievementsApi.getAchievements().then((r) => setAchievements(r.data)).catch(() => {}),
      exercisesApi.getMyPlans().then((r) => {
        const names = new Set<string>();
        (r.data || []).forEach((up: any) => (up.plan?.exercises?.exercises || []).forEach((e: any) => names.add(e.name)));
        setProgramExercises(Array.from(names));
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [loadGoals, loadWeights]);

  const bodyGoal = goals.find((g) => g.type === 'bodyweight');
  const weightData = [...weights].map((w) => ({ date: w.date, weightKg: w.weightKg }));

  const bigThree = ['bench', 'squat', 'deadlift'].map((type) => {
    const pr = prs.filter((p) => p.exerciseType === type && p.isCurrentSeason).sort((a: any, b: any) => b.weightKg - a.weightKg)[0];
    return { name: type[0].toUpperCase() + type.slice(1), oneRM: pr ? epley1RM(pr.weightKg, pr.reps) : 0 };
  });
  const hasStrength = bigThree.some((b) => b.oneRM > 0);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="loader-ring" /></div>;

  return (
    <PageTransition className="space-y-5 max-w-2xl mx-auto">
      <h1 className="text-2xl font-display font-extrabold tracking-tight flex items-center gap-2">
        <TrendingUp size={24} className="text-brand-400" /> Progress
      </h1>

      {/* Personal goals */}
      <Item standalone>
        <GoalsSection goals={goals} programExercises={programExercises} onChange={loadGoals} />
      </Item>

      {/* Body weight */}
      <Item standalone>
        <Card className="p-5">
          <CardHeader icon={<Weight size={16} />} title="Body Weight"
            action={bodyGoal ? <span className="text-xs text-volt-400 nums">goal {bodyGoal.targetValue}kg</span> : undefined} />
          {weightData.length > 1 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={weightData} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="bw" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3b97f5" /><stop offset="100%" stopColor="#0a80f5" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: 'hsl(var(--muted-foreground))' }} formatter={(v: any) => [`${v} kg`, 'Weight']} />
                {bodyGoal && (
                  <ReferenceLine y={bodyGoal.targetValue} stroke="#faba0c" strokeDasharray="5 4"
                    label={{ value: `Goal ${bodyGoal.targetValue}kg`, fill: '#faba0c', fontSize: 10, position: 'insideTopRight' }} />
                )}
                <Line type="monotone" dataKey="weightKg" stroke="url(#bw)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#0a80f5' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground mb-2">Log your weight a few times to see the trend.</p>
          )}
          <WeightLog weights={weights} onChange={loadWeights} />
        </Card>
      </Item>

      {/* Strength */}
      {hasStrength && (
        <Item standalone>
          <Card className="p-5">
            <CardHeader accent="volt" icon={<Dumbbell size={16} />} title="Strength — Estimated 1RM" />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bigThree} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} unit="kg" />
                <Tooltip contentStyle={CHART_TOOLTIP} cursor={{ fill: 'hsl(var(--secondary) / 0.4)' }} formatter={(v: any) => [`${v} kg`, 'Est. 1RM']} />
                <Bar dataKey="oneRM" radius={[6, 6, 0, 0]}>
                  {bigThree.map((_, i) => <Cell key={i} fill={['#0a80f5', '#3b97f5', '#faba0c'][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Item>
      )}

      {/* Achievements */}
      <Item standalone>
        <AchievementsSection achievements={achievements} />
      </Item>
    </PageTransition>
  );
}

// ── Goals ────────────────────────────────────────────────────────────────────
function GoalsSection({ goals, programExercises, onChange }: { goals: any[]; programExercises: string[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<'bodyweight' | 'lift'>('bodyweight');
  const [exerciseName, setExerciseName] = useState('');
  const [target, setTarget] = useState('');

  const create = async () => {
    const t = parseFloat(target);
    if (!t || (type === 'lift' && !exerciseName)) return;
    await goalsApi.create({ type, targetValue: t, exerciseName: type === 'lift' ? exerciseName : undefined });
    setAdding(false); setTarget(''); setExerciseName('');
    onChange();
  };
  const remove = async (id: number) => { await goalsApi.remove(id); onChange(); };

  return (
    <Card className="p-5">
      <CardHeader accent="brand" icon={<Target size={16} />} title="Personal Goals"
        action={<button onClick={() => setAdding((v) => !v)} className="text-xs font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1"><Plus size={14} /> Set goal</button>} />

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mb-4 p-3 rounded-xl border border-border bg-secondary/40 space-y-2">
              <div className="flex gap-1.5">
                {(['bodyweight', 'lift'] as const).map((t) => (
                  <button key={t} onClick={() => setType(t)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${type === t ? 'bg-brand-500/15 border-brand-500/40 text-brand-300' : 'bg-secondary border-border text-muted-foreground'}`}>
                    {t === 'bodyweight' ? 'Body weight' : 'Lift target'}
                  </button>
                ))}
              </div>
              {type === 'lift' && (
                programExercises.length ? (
                  <select value={exerciseName} onChange={(e) => setExerciseName(e.target.value)} className="field">
                    <option value="">Choose an exercise from your program…</option>
                    {programExercises.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-muted-foreground">No program exercises yet — ask your admin to assign a plan.</p>
                )
              )}
              <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={type === 'bodyweight' ? 'Target weight (kg)' : 'Target lift (kg)'} className="field" />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={create} disabled={!target || (type === 'lift' && !exerciseName)}>Set goal</Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No goals yet. Set a target body weight or a lift goal to track it here.</p>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => (
            <div key={g.id} className="rounded-xl border border-border bg-secondary/30 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {g.achieved ? <Trophy size={15} className="text-volt-400 flex-shrink-0" /> : (g.type === 'bodyweight' ? <Weight size={15} className="text-brand-400 flex-shrink-0" /> : <Dumbbell size={15} className="text-brand-400 flex-shrink-0" />)}
                  <p className="text-sm font-medium truncate">{g.type === 'bodyweight' ? 'Body weight' : g.exerciseName} → {g.targetValue}kg</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold nums ${g.achieved ? 'text-volt-400' : 'text-brand-400'}`}>{g.percent}%</span>
                  <button onClick={() => remove(g.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={13} /></button>
                </div>
              </div>
              <Progress value={g.percent} color={g.achieved ? 'volt' : 'brand'} height="h-1.5" />
              <p className="text-xs text-muted-foreground mt-1.5 nums">
                {g.achieved ? 'Achieved! 🎉' : `Now ${g.current}kg · ${Math.abs(Math.round((g.targetValue - g.current) * 10) / 10)}kg to go`}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Body weight log ──────────────────────────────────────────────────────────
function WeightLog({ weights, onChange }: { weights: any[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(todayStr());

  const save = async () => {
    const w = parseFloat(weight);
    if (!w) return;
    await bodyWeightApi.log(w, undefined, date);
    setWeight(''); setDate(todayStr());
    onChange();
  };
  const del = async (id: number) => { await bodyWeightApi.deleteEntry(id); onChange(); };
  const edit = (e: any) => { setWeight(String(e.weightKg)); setDate(e.date); setOpen(true); };

  const recent = [...weights].reverse().slice(0, 8);

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Entries</p>
        <button onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1"><Plus size={13} /> Add / edit</button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex gap-2 mb-3">
              <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="kg" className="field w-24 text-center" />
              <input type="date" max={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} className="field flex-1" />
              <Button size="sm" onClick={save} disabled={!weight}>Save</Button>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1 mb-3">Saving a date that already exists updates it.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries yet.</p>
      ) : (
        <div className="space-y-1">
          {recent.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-sm py-1">
              <span className="text-muted-foreground text-xs nums">{new Date(e.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
              <span className="font-semibold nums">{e.weightKg} kg</span>
              <div className="flex items-center gap-2">
                <button onClick={() => edit(e)} className="text-muted-foreground hover:text-brand-400 transition-colors"><Pencil size={12} /></button>
                <button onClick={() => del(e.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Achievements ─────────────────────────────────────────────────────────────
function AchievementsSection({ achievements }: { achievements: any[] }) {
  const unlocked = achievements.filter((a) => a.unlocked);
  const locked = achievements.filter((a) => !a.unlocked).sort((a, b) => b.percent - a.percent);

  const fmt = (n: number, unit: string) => (unit === 'kg' ? `${n.toLocaleString()}kg` : `${n} ${unit}`);

  const cardOf = (a: any) => (
    <motion.div whileHover={{ y: -3 }} className={`h-full rounded-2xl border p-4 ${a.unlocked ? 'border-success/40 bg-success/[0.06]' : 'border-border bg-card'}`}>
      <div className="flex items-center gap-2 mb-1">
        {a.unlocked ? <CheckCircle2 size={16} className="text-success flex-shrink-0" /> : <Lock size={16} className="text-muted-foreground flex-shrink-0" />}
        <p className="font-semibold text-sm">{a.title}</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{a.description}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs nums">
          <span className="text-muted-foreground">{fmt(a.current, a.unit)} / {fmt(a.target, a.unit)}</span>
          <span className={a.unlocked ? 'text-success font-semibold' : 'text-brand-400'}>{a.percent}%</span>
        </div>
        <Progress value={a.percent} color={a.unlocked ? 'success' : 'brand'} height="h-2" />
      </div>
    </motion.div>
  );

  return (
    <Card className="p-5">
      <CardHeader icon={<Target size={16} />} title="Achievements"
        action={<span className="text-xs text-muted-foreground nums">{unlocked.length}/{achievements.length}</span>} />
      {unlocked.length > 0 && (
        <>
          <p className="text-xs font-semibold text-success uppercase tracking-wider mb-2">Unlocked</p>
          <Stagger className="grid sm:grid-cols-2 gap-3 mb-4">
            {unlocked.map((a) => <Item key={a.id}>{cardOf(a)}</Item>)}
          </Stagger>
        </>
      )}
      {locked.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">In progress</p>
          <Stagger className="grid sm:grid-cols-2 gap-3">
            {locked.map((a) => <Item key={a.id}>{cardOf(a)}</Item>)}
          </Stagger>
        </>
      )}
    </Card>
  );
}

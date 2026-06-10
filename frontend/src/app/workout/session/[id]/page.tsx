'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, CheckCircle2, RotateCcw, Timer, Lightbulb, Trash2, Dumbbell } from 'lucide-react';
import { workoutsApi, exercisesApi, usersApi } from '@/lib/api';
import { epley1RM } from '@/lib/utils';
import { PageTransition } from '@/components/ui/motion-primitives';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

interface SetLog { id?: number; exerciseName: string; setNumber: number; actualReps: number; weightKg: number; targetReps?: number; }
interface PlanExercise { name: string; sets: number; reps: string; bwMultiplier: number; rest: number; notes?: string; }

const firstNum = (s: string) => { const m = String(s || '').match(/\d+/); return m ? m[0] : ''; };
const round25 = (n: number) => Math.round(n / 2.5) * 2.5;

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = parseInt(id);

  const [session, setSession] = useState<any>(null);
  const [planExercises, setPlanExercises] = useState<PlanExercise[]>([]);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [userWeight, setUserWeight] = useState(75);
  const [sets, setSets] = useState<SetLog[]>([]);
  const [inputs, setInputs] = useState<Record<string, { weight: string; reps: string }>>({});
  const [completing, setCompleting] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [notes, setNotes] = useState('');
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  // Off-plan exercise logging
  const [showExtra, setShowExtra] = useState(false);
  const [extra, setExtra] = useState({ name: '', weight: '', reps: '' });

  const loadSets = useCallback((data: any) => {
    setSets((data?.sets || []).map((s: any) => ({
      id: s.id, exerciseName: s.exerciseName, setNumber: s.setNumber,
      actualReps: s.actualReps, weightKg: s.weightKg, targetReps: s.targetReps,
    })));
  }, []);

  useEffect(() => {
    workoutsApi.getSession(sessionId).then((r) => {
      setSession(r.data);
      if (r.data?.completedAt) { router.replace('/workout'); return; }
      loadSets(r.data);
      if (r.data?.workoutPlanId) {
        exercisesApi.getPlan(r.data.workoutPlanId)
          .then((p) => setPlanExercises(p.data?.exercises?.exercises || []))
          .catch(() => {});
      }
      if (r.data?.workoutType) {
        workoutsApi.getSuggestion(r.data.workoutType).then((sr) => setSuggestion(sr.data)).catch(() => {});
      }
    });
    usersApi.getProfile().then((r) => { if (r.data.weightKg) setUserWeight(r.data.weightKg); }).catch(() => {});
  }, [sessionId, router, loadSets]);

  useEffect(() => {
    let t: ReturnType<typeof setInterval>;
    if (timerActive) t = setInterval(() => setTimer((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [timerActive]);

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const byExercise = sets.reduce((acc: Record<string, SetLog[]>, s) => {
    (acc[s.exerciseName] ||= []).push(s);
    return acc;
  }, {});

  // First session → bodyweight-scaled; 2nd+ → progressive-overload suggestion
  const suggestedWeight = (ex: PlanExercise): number => {
    const sug = suggestion?.suggestions?.[ex.name];
    if (sug?.weightKg) return sug.weightKg;
    if (ex.bwMultiplier) return round25(userWeight * ex.bwMultiplier);
    return 0;
  };

  const getInput = (name: string, field: 'weight' | 'reps', fallback: string) =>
    inputs[name]?.[field] ?? fallback;
  const setInput = (name: string, field: 'weight' | 'reps', value: string) =>
    setInputs((prev) => {
      const cur = prev[name] ?? { weight: '', reps: '' };
      return { ...prev, [name]: { ...cur, [field]: value } };
    });

  const addSet = async (exerciseName: string, weight: number, reps: number, targetReps?: number) => {
    if (!exerciseName || !weight || !reps) return;
    const setNum = (byExercise[exerciseName]?.length || 0) + 1;
    try {
      await workoutsApi.logSet(sessionId, { exerciseName, setNumber: setNum, actualReps: reps, weightKg: weight, targetReps });
      const fresh = await workoutsApi.getSession(sessionId);
      loadSets(fresh.data);
      setTimer(0); setTimerActive(true);
    } catch (e) { console.error(e); }
  };

  const deleteSet = async (setId?: number) => {
    if (!setId) return;
    try { await workoutsApi.deleteSet(setId); const fresh = await workoutsApi.getSession(sessionId); loadSets(fresh.data); }
    catch (e) { console.error(e); }
  };

  const logExtra = async () => {
    const w = parseFloat(extra.weight), r = parseInt(extra.reps);
    if (!extra.name || !w || !r) return;
    await addSet(extra.name.trim(), w, r);
    setExtra({ name: '', weight: '', reps: '' });
  };

  const completeSession = async () => {
    if (!sets.length) return;
    setCompleting(true);
    try { await workoutsApi.completeSession(sessionId, notes); router.replace('/workout'); }
    catch (e) { console.error(e); } finally { setCompleting(false); }
  };
  const abandonSession = async () => {
    if (!confirmAbandon) { setConfirmAbandon(true); return; }
    setAbandoning(true);
    try { await workoutsApi.resetSession(sessionId); router.replace('/workout'); }
    catch (e) { console.error(e); } finally { setAbandoning(false); }
  };

  if (!session) return <div className="flex items-center justify-center h-64"><div className="loader-ring" /></div>;

  const planNames = new Set(planExercises.map((e) => e.name));
  const offPlan = Object.keys(byExercise).filter((n) => !planNames.has(n));
  const isFirstSession = !suggestion?.suggestions;

  return (
    <PageTransition className="space-y-4 max-w-lg mx-auto pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold">{session.workoutType || 'Workout'}</h1>
          <p className="text-xs text-muted-foreground nums">
            {new Date(session.startedAt).toLocaleDateString('en-GB')} · {sets.length} sets logged
          </p>
        </div>
        <div className="text-right">
          <motion.button
            onClick={() => (timerActive ? (setTimerActive(false), setTimer(0)) : setTimerActive(true))}
            whileTap={{ scale: 0.94 }}
            className={`text-2xl font-display font-bold flex items-center gap-1.5 nums ${timerActive ? 'text-brand-400' : 'text-muted-foreground'}`}
          >
            <motion.span animate={timerActive ? { rotate: [0, 8, -8, 0] } : {}} transition={{ duration: 1, repeat: Infinity }}>
              <Timer size={16} className={timerActive ? 'text-volt-400' : 'text-muted-foreground/50'} />
            </motion.span>
            {fmtTime(timer)}
          </motion.button>
          <p className="text-[10px] text-muted-foreground">Rest timer</p>
        </div>
      </div>

      {isFirstSession ? (
        <div className="rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
          <Dumbbell size={13} className="text-brand-400 flex-shrink-0" />
          First session — starting weights are estimated from your bodyweight. Next time you&apos;ll get progression based on today.
        </div>
      ) : (
        <div className="rounded-xl border border-brand-500/20 bg-brand-500/[0.06] px-3.5 py-2.5 text-xs text-brand-200 flex items-center gap-2">
          <Lightbulb size={13} className="text-brand-400 flex-shrink-0" />
          Suggested weights are based on your last {session.workoutType} session.
        </div>
      )}

      {/* Plan exercises */}
      {planExercises.map((ex, idx) => {
        const logged = byExercise[ex.name] || [];
        const sw = suggestedWeight(ex);
        const sugReps = suggestion?.suggestions?.[ex.name]?.reps;
        const wVal = getInput(ex.name, 'weight', sw ? String(sw) : '');
        const rVal = getInput(ex.name, 'reps', sugReps ? String(sugReps) : firstNum(ex.reps));
        return (
          <Card key={idx} className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="font-semibold text-sm">{ex.name}</p>
                <p className="text-xs text-muted-foreground nums">Target: {ex.sets} × {ex.reps} reps{ex.rest ? ` · ${ex.rest}s rest` : ''}</p>
              </div>
              {sw > 0 && (
                <span className="text-xs bg-volt-400/15 text-volt-400 px-2 py-0.5 rounded-md font-medium nums whitespace-nowrap">
                  {logged.length >= ex.sets ? 'done' : `try ${sw}kg`}
                </span>
              )}
            </div>

            {/* Logged sets */}
            <AnimatePresence initial={false}>
              {logged.map((s) => (
                <motion.div key={s.id ?? s.setNumber} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                  className="flex items-center justify-between text-sm py-1.5 nums border-b border-border/60 last:border-0">
                  <span className="text-muted-foreground text-xs w-12">Set {s.setNumber}</span>
                  <span className="font-semibold flex-1">{s.weightKg} kg × {s.actualReps}</span>
                  <span className="text-xs text-muted-foreground mr-2">~{epley1RM(s.weightKg, s.actualReps)} 1RM</span>
                  <button onClick={() => deleteSet(s.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={13} /></button>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Inline add */}
            <div className="flex gap-2 mt-2.5">
              <div className="flex-1">
                <input type="number" inputMode="decimal" step="0.5" value={wVal} onChange={(e) => setInput(ex.name, 'weight', e.target.value)} placeholder="kg" className="field !py-2 text-center" />
              </div>
              <span className="self-center text-muted-foreground text-sm">×</span>
              <div className="flex-1">
                <input type="number" inputMode="numeric" value={rVal} onChange={(e) => setInput(ex.name, 'reps', e.target.value)} placeholder="reps" className="field !py-2 text-center" />
              </div>
              <Button size="sm" onClick={() => addSet(ex.name, parseFloat(wVal), parseInt(rVal), parseInt(firstNum(ex.reps)) || undefined)} disabled={!wVal || !rVal}>
                <Plus size={15} />
              </Button>
            </div>
            {ex.notes && <p className="text-[11px] text-muted-foreground/70 mt-2 italic">{ex.notes}</p>}
          </Card>
        );
      })}

      {/* Off-plan logged exercises */}
      {offPlan.map((name) => (
        <Card key={name} className="p-4">
          <p className="font-semibold text-sm mb-1">{name} <span className="text-xs text-muted-foreground font-normal">(extra)</span></p>
          {byExercise[name].map((s) => (
            <div key={s.id ?? s.setNumber} className="flex items-center justify-between text-sm py-1.5 nums border-b border-border/60 last:border-0">
              <span className="text-muted-foreground text-xs w-12">Set {s.setNumber}</span>
              <span className="font-semibold flex-1">{s.weightKg} kg × {s.actualReps}</span>
              <button onClick={() => deleteSet(s.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={13} /></button>
            </div>
          ))}
          <button onClick={() => { setShowExtra(true); setExtra({ name, weight: '', reps: '' }); }} className="text-xs text-brand-400 hover:text-brand-300 mt-2 transition-colors">+ Add another set</button>
        </Card>
      ))}

      {/* Log an off-plan exercise */}
      <Card className="p-4">
        <button onClick={() => setShowExtra((v) => !v)} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
          <Plus size={15} /> Log another exercise
        </button>
        <AnimatePresence>
          {showExtra && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="space-y-2 pt-3">
                <input value={extra.name} onChange={(e) => setExtra({ ...extra, name: e.target.value })} placeholder="Exercise name" className="field" />
                <div className="flex gap-2">
                  <input type="number" step="0.5" value={extra.weight} onChange={(e) => setExtra({ ...extra, weight: e.target.value })} placeholder="kg" className="field flex-1 text-center" />
                  <span className="self-center text-muted-foreground">×</span>
                  <input type="number" value={extra.reps} onChange={(e) => setExtra({ ...extra, reps: e.target.value })} placeholder="reps" className="field flex-1 text-center" />
                  <Button size="sm" onClick={logExtra} disabled={!extra.name || !extra.weight || !extra.reps}><Plus size={15} /></Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Finish */}
      <AnimatePresence>
        {sets.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="p-4 space-y-3">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Session notes (optional)…" rows={2} className="field resize-none" />
              <Button onClick={completeSession} disabled={completing} className="w-full !bg-success !bg-none !text-white shadow-none" size="lg">
                <CheckCircle2 size={18} />{completing ? 'Saving…' : `Complete Session · ${sets.length} sets`}
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Abandon */}
      <div className="pt-2">
        <AnimatePresence mode="wait">
          {confirmAbandon ? (
            <motion.div key="confirm" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 space-y-3">
              <p className="text-sm text-destructive font-medium">Abandon this session? All sets will be deleted.</p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={abandonSession} disabled={abandoning} className="flex-1">{abandoning ? 'Abandoning…' : 'Yes, Abandon'}</Button>
                <Button variant="secondary" onClick={() => setConfirmAbandon(false)} className="flex-1">Keep Going</Button>
              </div>
            </motion.div>
          ) : (
            <motion.button key="abandon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} whileTap={{ scale: 0.98 }}
              onClick={() => setConfirmAbandon(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-muted-foreground border border-border rounded-2xl hover:border-destructive/40 hover:text-destructive transition-colors text-sm">
              <RotateCcw size={14} /> Abandon Session
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}

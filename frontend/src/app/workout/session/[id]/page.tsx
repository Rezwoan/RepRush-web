'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, CheckCircle2, ChevronDown, Lightbulb, RotateCcw, Timer } from 'lucide-react';
import { workoutsApi } from '@/lib/api';
import { formatWeight, epley1RM } from '@/lib/utils';
import { PageTransition } from '@/components/ui/motion-primitives';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

interface SetLog { exerciseName: string; setNumber: number; actualReps: number; weightKg: number; targetReps?: number; }

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = parseInt(id);

  const [session, setSession] = useState<any>(null);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [currentExercise, setCurrentExercise] = useState('');
  const [sets, setSets] = useState<SetLog[]>([]);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [targetReps, setTargetReps] = useState('');
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [notes, setNotes] = useState('');
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    workoutsApi.getSession(sessionId).then((r) => {
      setSession(r.data);
      if (r.data?.completedAt) router.replace('/workout');
      if (r.data?.sets?.length) {
        setSets(r.data.sets.map((s: any) => ({
          exerciseName: s.exerciseName, setNumber: s.setNumber,
          actualReps: s.actualReps, weightKg: s.weightKg, targetReps: s.targetReps,
        })));
      }
      if (r.data?.workoutType) {
        workoutsApi.getSuggestion(r.data.workoutType).then((sr) => setSuggestion(sr.data)).catch(() => {});
      }
    });
  }, [sessionId]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (timerActive) interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timerActive]);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const byExercise = sets.reduce((acc: Record<string, SetLog[]>, s) => {
    (acc[s.exerciseName] ||= []).push(s);
    return acc;
  }, {});

  const addSet = async () => {
    if (!currentExercise || !reps || !weight) return;
    const r = parseInt(reps), w = parseFloat(weight), t = targetReps ? parseInt(targetReps) : undefined;
    const setNum = (byExercise[currentExercise]?.length || 0) + 1;
    try {
      await workoutsApi.logSet(sessionId, { exerciseName: currentExercise, setNumber: setNum, actualReps: r, weightKg: w, targetReps: t });
      setSets((prev) => [...prev, { exerciseName: currentExercise, setNumber: setNum, actualReps: r, weightKg: w, targetReps: t }]);
      setReps(''); setWeight(''); setTimer(0); setTimerActive(true);
    } catch (e) { console.error(e); }
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
            {formatTime(timer)}
          </motion.button>
          <p className="text-[10px] text-muted-foreground">Rest timer</p>
        </div>
      </div>

      {/* AI Suggestions */}
      {suggestion?.suggestions && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft}
          className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-3.5">
          <p className="text-xs text-brand-300 font-semibold mb-2 flex items-center gap-1.5">
            <Lightbulb size={12} /> Suggestions from your last session
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(suggestion.suggestions).slice(0, 3).map(([ex, sug]: any) => (
              <motion.button
                key={ex}
                whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.04 }}
                onClick={() => { setCurrentExercise(ex); setWeight(String(sug.weightKg)); setReps(String(sug.reps)); }}
                className="text-xs bg-brand-500/12 text-brand-200 hover:bg-brand-500/20 px-2.5 py-1.5 rounded-lg transition-colors nums"
              >
                {ex}: {sug.weightKg}kg × {sug.reps}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Log set */}
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-sm">Log a Set</h2>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Exercise</label>
          <input type="text" value={currentExercise} onChange={(e) => setCurrentExercise(e.target.value)} placeholder="e.g. Bench Press" list="exercise-suggestions" className="field" />
          <datalist id="exercise-suggestions">
            {Object.keys(byExercise).map((ex) => <option key={ex} value={ex} />)}
          </datalist>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className="text-xs text-muted-foreground block mb-1">Weight (kg)</label>
            <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="100" step="0.5" className="field" /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Reps done</label>
            <input type="number" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="8" className="field" /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">Target reps</label>
            <input type="number" value={targetReps} onChange={(e) => setTargetReps(e.target.value)} placeholder="10" className="field" /></div>
        </div>
        <AnimatePresence>
          {weight && reps && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-muted-foreground">
              Est. 1RM: <span className="text-volt-400 font-semibold nums">{epley1RM(parseFloat(weight), parseInt(reps))} kg</span>
            </motion.p>
          )}
        </AnimatePresence>
        <Button onClick={addSet} disabled={!currentExercise || !reps || !weight} className="w-full"><Plus size={16} /> Log Set</Button>
      </Card>

      {/* Logged exercises */}
      <AnimatePresence initial={false}>
        {Object.entries(byExercise).map(([exercise, exSets]) => {
          const isExpanded = expandedExercise === exercise;
          return (
            <motion.div key={exercise} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft}>
              <Card className="overflow-hidden">
                <button onClick={() => setExpandedExercise(isExpanded ? null : exercise)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/40 transition-colors">
                  <div className="text-left">
                    <p className="font-medium text-sm">{exercise}</p>
                    <p className="text-xs text-muted-foreground nums">
                      {exSets.length} sets · best: {formatWeight(Math.max(...exSets.map((s) => s.weightKg)))} × {Math.max(...exSets.map((s) => s.actualReps))}
                    </p>
                  </div>
                  <motion.span animate={{ rotate: isExpanded ? 180 : 0 }} transition={spring.snappy} className="text-muted-foreground">
                    <ChevronDown size={16} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-4 pb-3 space-y-1.5 border-t border-border">
                        {exSets.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-sm py-1.5 nums">
                            <span className="text-muted-foreground text-xs w-10">Set {s.setNumber}</span>
                            <span className="text-foreground font-semibold">{s.weightKg} kg × {s.actualReps}</span>
                            {s.targetReps && <span className={`text-xs font-medium ${s.actualReps >= s.targetReps ? 'text-success' : 'text-destructive'}`}>/{s.targetReps}</span>}
                            <span className="text-xs text-muted-foreground">~{epley1RM(s.weightKg, s.actualReps)} 1RM</span>
                          </div>
                        ))}
                        <button onClick={() => setCurrentExercise(exercise)} className="text-xs text-brand-400 hover:text-brand-300 mt-1 transition-colors">+ Add another set</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Finish */}
      <AnimatePresence>
        {sets.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="p-4 space-y-3">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Session notes (optional)…" rows={2} className="field resize-none" />
              <Button variant="brand" onClick={completeSession} disabled={completing} className="w-full !bg-success !bg-none !text-white shadow-none" size="lg">
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

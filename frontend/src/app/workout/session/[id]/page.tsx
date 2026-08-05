'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, CheckCircle2, Check, RotateCcw, Timer, Trash2, Dumbbell,
  ArrowLeft, Pencil, ChevronDown, CheckSquare, ListChecks, Flame, CloudOff,
} from 'lucide-react';
import { workoutsApi, exercisesApi } from '@/lib/api';
import {
  cacheSession, getCachedSession, materializeSets, queueLogSet, queueDeleteSet,
  queueCompleteSession, flushOutbox, subscribe, resolveSessionId, type CachedSet,
} from '@/lib/offline';
import { epley1RM } from '@/lib/utils';
import { PageTransition } from '@/components/ui/motion-primitives';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

type SetLog = CachedSet;
interface PlanExercise { name: string; sets: number; reps: string; rest: number; notes?: string; warmUpSets?: string[]; baselineWeight?: number; }
/** Last session's actual working sets for one exercise, in set order. */
interface LastSet { setNumber: number; weightKg: number; reps: number; }

const firstNum = (s: string) => { const m = String(s || '').match(/\d+/); return m ? m[0] : ''; };

// Parse a warm-up string ("40kg x 8", "Machine empty x 10", "+40kg x 6") → { weight, reps }.
// Returns null for guidance-only entries like "Muscle already warm".
const parseWarm = (str: string): { weight: number; reps: number } | null => {
  const parts = String(str || '').toLowerCase().split('x');
  if (parts.length < 2) return null;
  const repsM = parts[1].match(/\d+/);
  if (!repsM) return null;
  const wM = parts[0].match(/[\d.]+/);
  return { weight: wM ? parseFloat(wM[0]) : 0, reps: parseInt(repsM[0]) };
};

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // A session started offline carries a temporary negative id until it syncs;
  // resolve it so this page follows the session to its real id afterwards.
  const sessionId = resolveSessionId(parseInt(id));

  const [session, setSession] = useState<any>(null);
  const [planExercises, setPlanExercises] = useState<PlanExercise[]>([]);
  const [lastValues, setLastValues] = useState<Record<string, { sets: LastSet[] }>>({});
  const [sets, setSets] = useState<SetLog[]>([]);
  const [inputs, setInputs] = useState<Record<string, { weight: string; reps: string }>>({});
  const [addedSlots, setAddedSlots] = useState<Record<string, number>>({});
  const [skipWarmup, setSkipWarmup] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  // Off-plan exercise logging
  const [showExtra, setShowExtra] = useState(false);
  const [extra, setExtra] = useState({ name: '', weight: '', reps: '' });

  // Always render the cached snapshot + queued writes, so the list looks the
  // same whether the last set reached the server or is still in the outbox.
  const rerender = useCallback(() => setSets(materializeSets(sessionId)), [sessionId]);

  const loadSets = useCallback((data: any) => {
    cacheSession(sessionId, data);
    rerender();
  }, [sessionId, rerender]);

  useEffect(() => {
    // Re-render whenever the outbox drains in the background.
    const unsub = subscribe(() => rerender());
    return unsub;
  }, [rerender]);

  useEffect(() => {
    const hydrate = (data: any) => {
      setSession(data);
      if (data?.workoutPlanId) {
        exercisesApi.getPlan(data.workoutPlanId)
          .then((p) => {
            const list = p.data?.exercises?.exercises || [];
            setPlanExercises(list);
            localStorage.setItem(`reprush_plan_${data.workoutPlanId}`, JSON.stringify(list));
          })
          .catch(() => {
            // Offline: reuse the plan we cached the last time it loaded.
            const raw = localStorage.getItem(`reprush_plan_${data.workoutPlanId}`);
            if (raw) { try { setPlanExercises(JSON.parse(raw)); } catch { /* ignore */ } }
          });
      }
      if (data?.workoutType) {
        workoutsApi.getLastValues(data.workoutType)
          .then((sr) => {
            setLastValues(sr.data?.exercises || {});
            localStorage.setItem(`reprush_last_${data.workoutType}`, JSON.stringify(sr.data?.exercises || {}));
          })
          .catch(() => {
            const raw = localStorage.getItem(`reprush_last_${data.workoutType}`);
            if (raw) { try { setLastValues(JSON.parse(raw)); } catch { /* ignore */ } }
          });
      }
    };

    workoutsApi.getSession(sessionId)
      .then((r) => {
        if (r.data?.completedAt) { router.replace('/workout'); return; }
        loadSets(r.data);
        hydrate(r.data);
      })
      .catch(() => {
        // No connection — run the session entirely from the local cache.
        const cached = getCachedSession(sessionId);
        if (cached) { rerender(); hydrate(cached); }
      });
  }, [sessionId, router, loadSets, rerender]);

  useEffect(() => {
    let t: ReturnType<typeof setInterval>;
    if (timerActive) t = setInterval(() => setTimer((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [timerActive]);

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Working sets and warm-ups live in the same table — split them by the flag.
  const group = (arr: SetLog[]) => {
    const acc: Record<string, SetLog[]> = {};
    arr.forEach((s) => { (acc[s.exerciseName] ||= []).push(s); });
    Object.values(acc).forEach((a) => a.sort((x, y) => x.setNumber - y.setNumber));
    return acc;
  };
  const working = sets.filter((s) => !s.isWarmup);
  const warm = sets.filter((s) => s.isWarmup);
  const byExercise = group(working);
  const warmByExercise = group(warm);

  // Ghost values are last session's actual numbers for this exact set — nothing
  // is predicted, incremented, or scaled by body weight. Set N ghosts set N; if
  // last session had fewer sets, fall back to its final set.
  const lastSetFor = (ex: PlanExercise, setNumber: number): LastSet | undefined => {
    const prev = lastValues[ex.name]?.sets;
    if (!prev?.length) return undefined;
    return prev.find((s) => s.setNumber === setNumber) || prev[prev.length - 1];
  };
  const ghostWeight = (ex: PlanExercise, setNumber: number): number =>
    lastSetFor(ex, setNumber)?.weightKg ?? ex.baselineWeight ?? 0;
  const ghostReps = (ex: PlanExercise, setNumber: number): number =>
    lastSetFor(ex, setNumber)?.reps ?? parseInt(firstNum(ex.reps)) ?? 0;

  const getInp = (key: string, field: 'weight' | 'reps', fallback: string) => inputs[key]?.[field] ?? fallback;
  const setInp = (key: string, field: 'weight' | 'reps', value: string) =>
    setInputs((prev) => {
      const cur = prev[key] ?? { weight: '', reps: '' };
      return { ...prev, [key]: { ...cur, [field]: value } };
    });

  const exDone = (ex: PlanExercise) => (byExercise[ex.name]?.length || 0);
  const exTotal = (ex: PlanExercise) => Math.max(ex.sets + (addedSlots[ex.name] || 0), byExercise[ex.name]?.length || 0);

  type WSlot =
    | { type: 'logged'; set: SetLog; setNumber: number }
    | { type: 'pending'; setNumber: number; weight: string; reps: string; target?: number; phW: string; phR: string };

  const exSlots = (ex: PlanExercise): WSlot[] => {
    const logged = byExercise[ex.name] || [];
    const total = exTotal(ex);
    const out: WSlot[] = [];
    for (let i = 0; i < total; i++) {
      const setNumber = i + 1;
      if (i < logged.length) { out.push({ type: 'logged', set: logged[i], setNumber }); continue; }
      const gw = ghostWeight(ex, setNumber), gr = ghostReps(ex, setNumber);
      out.push({
        type: 'pending', setNumber,
        weight: getInp(`W:${ex.name}:${setNumber}`, 'weight', ''),
        reps: getInp(`W:${ex.name}:${setNumber}`, 'reps', ''),
        target: parseInt(firstNum(ex.reps)) || undefined,
        phW: gw ? String(gw) : 'kg',
        phR: gr ? String(gr) : 'reps',
      });
    }
    return out;
  };

  type USlot =
    | { type: 'logged'; set: SetLog; setNumber: number }
    | { type: 'pending'; setNumber: number; weight: string; reps: string; phW: string; phR: string };

  const warmSlots = (ex: PlanExercise): USlot[] => {
    const parsed = (ex.warmUpSets || []).map(parseWarm).filter(Boolean) as { weight: number; reps: number }[];
    const logged = warmByExercise[ex.name] || [];
    const total = Math.max(parsed.length, logged.length);
    const out: USlot[] = [];
    for (let i = 0; i < total; i++) {
      const setNumber = i + 1;
      if (i < logged.length) { out.push({ type: 'logged', set: logged[i], setNumber }); continue; }
      const p = parsed[i];
      out.push({
        type: 'pending', setNumber,
        weight: getInp(`U:${ex.name}:${setNumber}`, 'weight', ''),
        reps: getInp(`U:${ex.name}:${setNumber}`, 'reps', ''),
        phW: p ? String(p.weight) : '0',
        phR: p ? String(p.reps) : 'reps',
      });
    }
    return out;
  };

  // Default-expand the first unfinished exercise once data is loaded.
  useEffect(() => {
    if (expanded !== null || !planExercises.length) return;
    const target = planExercises.find((ex) => exDone(ex) < ex.sets) || planExercises[0];
    setExpanded(target.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planExercises, sets]);

  /** Pull the server's view when we can; otherwise keep rendering locally. */
  const refresh = async () => {
    try {
      const fresh = await workoutsApi.getSession(sessionId);
      loadSets(fresh.data);
      return fresh.data;
    } catch {
      rerender();
      return { sets: materializeSets(sessionId) };
    }
  };
  const advanceFrom = (data: any) => {
    const next = planExercises.find((e) => ((data.sets || []).filter((s: any) => s.exerciseName === e.name && !s.isWarmup).length) < e.sets);
    if (next) setExpanded(next.name);
  };

  const logWorking = async (ex: PlanExercise, slot: Extract<WSlot, { type: 'pending' }>) => {
    const w = parseFloat(slot.weight || slot.phW), r = parseInt(slot.reps || slot.phR);
    if (!w || !r) return;
    // Queue first so the set is never lost, then sync opportunistically.
    queueLogSet(sessionId, { exerciseName: ex.name, setNumber: slot.setNumber, actualReps: r, weightKg: w, targetReps: slot.target, isWarmup: false });
    rerender();
    setTimer(0); setTimerActive(true);
    const local = materializeSets(sessionId);
    const done = local.filter((s) => s.exerciseName === ex.name && !s.isWarmup).length;
    if (done >= exTotal(ex)) advanceFrom({ sets: local });
    await flushOutbox();
    await refresh();
  };

  const logWarmup = async (ex: PlanExercise, slot: Extract<USlot, { type: 'pending' }>) => {
    const r = parseInt(slot.reps || slot.phR);
    if (!r) return;
    const wRaw = slot.weight !== '' ? parseFloat(slot.weight) : parseFloat(slot.phW);
    const w = isNaN(wRaw) ? 0 : wRaw; // warm-ups may be bodyweight / empty machine
    queueLogSet(sessionId, { exerciseName: ex.name, setNumber: slot.setNumber, actualReps: r, weightKg: w, isWarmup: true });
    rerender();
    await flushOutbox();
    await refresh();
  };

  const logNext = async () => {
    const ex = planExercises.find((e) => e.name === expanded);
    if (!ex) return;
    const next = exSlots(ex).find((s) => s.type === 'pending') as Extract<WSlot, { type: 'pending' }> | undefined;
    if (next) await logWorking(ex, next);
  };

  const logAll = async () => {
    const ex = planExercises.find((e) => e.name === expanded);
    if (!ex) return;
    const pend = exSlots(ex).filter((s) => s.type === 'pending') as Extract<WSlot, { type: 'pending' }>[];
    for (const s of pend) {
      const w = parseFloat(s.weight || s.phW), r = parseInt(s.reps || s.phR);
      if (!w || !r) continue;
      queueLogSet(sessionId, { exerciseName: ex.name, setNumber: s.setNumber, actualReps: r, weightKg: w, targetReps: s.target, isWarmup: false });
    }
    rerender();
    setTimer(0); setTimerActive(true);
    advanceFrom({ sets: materializeSets(sessionId) });
    await flushOutbox();
    await refresh();
  };

  const deleteSet = async (set: SetLog) => {
    queueDeleteSet(sessionId, set);
    rerender();
    await flushOutbox();
    await refresh();
  };

  const addSetSlot = (name: string) => setAddedSlots((p) => ({ ...p, [name]: (p[name] || 0) + 1 }));

  const logExtra = async () => {
    const w = parseFloat(extra.weight), r = parseInt(extra.reps);
    if (!extra.name || !w || !r) return;
    const setNum = (byExercise[extra.name.trim()]?.length || 0) + 1;
    queueLogSet(sessionId, { exerciseName: extra.name.trim(), setNumber: setNum, actualReps: r, weightKg: w, isWarmup: false });
    rerender();
    setExtra({ name: '', weight: '', reps: '' });
    await flushOutbox();
    await refresh();
  };

  const completeSession = async () => {
    if (!working.length) return;
    setCompleting(true);
    queueCompleteSession(sessionId, notes);
    await flushOutbox();
    setCompleting(false);
    router.replace(`/workout/summary/${sessionId}`);
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
  const expandedEx = planExercises.find((e) => e.name === expanded);
  const expandedHasPending = expandedEx ? exDone(expandedEx) < exTotal(expandedEx) : false;

  return (
    <PageTransition className="max-w-lg mx-auto pb-28">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <button onClick={() => router.push('/workout')} className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-display font-bold truncate">{session.workoutType || 'Workout'}</h1>
            <p className="text-[11px] text-muted-foreground nums">{working.length} working set{working.length !== 1 ? 's' : ''} logged</p>
          </div>
          <button onClick={() => setShowNotes((v) => !v)} className={`p-1 rounded-md transition-colors ${showNotes ? 'text-brand-400' : 'text-muted-foreground/70 hover:text-foreground'}`}>
            <Pencil size={14} />
          </button>
        </div>
        <motion.button
          onClick={() => (timerActive ? (setTimerActive(false), setTimer(0)) : setTimerActive(true))}
          whileTap={{ scale: 0.94 }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg nums text-lg font-display font-bold ${timerActive ? 'text-brand-300 bg-brand-500/10' : 'text-muted-foreground bg-secondary/60'}`}
        >
          <motion.span animate={timerActive ? { rotate: [0, 8, -8, 0] } : {}} transition={{ duration: 1, repeat: Infinity }}>
            <Timer size={15} className={timerActive ? 'text-volt-400' : 'text-muted-foreground/50'} />
          </motion.span>
          {fmtTime(timer)}
        </motion.button>
      </div>

      <AnimatePresence>
        {showNotes && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-3">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Session notes (optional)…" rows={2} className="field resize-none" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exercise accordion */}
      <div className="space-y-2.5">
        {planExercises.map((ex, idx) => {
          const open = expanded === ex.name;
          const done = exDone(ex);
          const total = exTotal(ex);
          const complete = done >= total && total > 0;
          const slots = open ? exSlots(ex) : [];
          const activeSetNumber = slots.find((s) => s.type === 'pending')?.setNumber;
          const wslots = open ? warmSlots(ex) : [];
          const warmNote = open && wslots.length === 0 && (ex.warmUpSets?.length || 0) > 0;
          const skipped = !!skipWarmup[ex.name];
          return (
            <Card key={idx} className="overflow-hidden p-0">
              {/* Header row */}
              <button onClick={() => setExpanded(open ? null : ex.name)} className="w-full flex items-center gap-3 p-3.5 text-left">
                <motion.span animate={{ rotate: open ? 0 : -90 }} transition={spring.snappy} className="text-muted-foreground flex-shrink-0">
                  <ChevronDown size={16} />
                </motion.span>
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${complete ? 'bg-success/15 text-success' : 'bg-brand-500/15 text-brand-400'}`}>
                  {complete ? <Check size={17} /> : <Dumbbell size={16} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{ex.name}</p>
                  {!open && <p className="text-[11px] text-muted-foreground nums">Target {ex.sets} × {ex.reps}</p>}
                </div>
                <span className={`text-xs font-medium nums flex-shrink-0 ${complete ? 'text-success' : 'text-muted-foreground'}`}>{done}/{total} Done</span>
              </button>

              {/* Body */}
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="px-3.5 pb-3.5">
                      {/* Warm-up subsection */}
                      {(wslots.length > 0 || warmNote) && (
                        <div className="mb-3 rounded-xl border border-volt-400/20 bg-volt-400/[0.04] p-2.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-volt-400">
                              <Flame size={12} /> Warm-up
                            </span>
                            {wslots.length > 0 && (
                              <button onClick={() => setSkipWarmup((p) => ({ ...p, [ex.name]: !p[ex.name] }))}
                                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                                {skipped ? 'Show' : 'Skip warm-up'}
                              </button>
                            )}
                          </div>
                          {warmNote ? (
                            <p className="text-[11px] text-muted-foreground italic">{ex.warmUpSets?.[0] || 'Muscle already warm'} — jump straight into working sets.</p>
                          ) : skipped ? (
                            <p className="text-[11px] text-muted-foreground italic">Warm-up skipped.</p>
                          ) : (
                            <div className="space-y-1">
                              {wslots.map((slot) => slot.type === 'logged' ? (
                                <div key={`wl-${slot.set.localId}`} className="flex items-center gap-2.5 py-1">
                                  <button onClick={() => deleteSet(slot.set)} title="Remove warm-up"
                                    className="w-5 h-5 rounded-full bg-volt-400/25 text-volt-500 flex items-center justify-center flex-shrink-0 hover:bg-destructive/20 hover:text-destructive transition-colors">
                                    <Check size={12} />
                                  </button>
                                  <span className="w-4 text-center text-[11px] text-muted-foreground">W{slot.setNumber}</span>
                                  <span className="flex-1 text-sm nums text-muted-foreground">{slot.set.weightKg ? `${slot.set.weightKg} kg` : 'Bodyweight'} × {slot.set.actualReps}</span>
                                </div>
                              ) : (
                                <div key={`wp-${slot.setNumber}`} className="flex items-center gap-2.5 py-1">
                                  <button onClick={() => logWarmup(ex, slot)} title="Mark warm-up done"
                                    className="w-5 h-5 rounded-full border-2 border-volt-400/50 text-transparent hover:bg-volt-400/15 flex items-center justify-center flex-shrink-0 transition-colors">
                                    <Check size={11} />
                                  </button>
                                  <span className="w-4 text-center text-[11px] text-muted-foreground">W{slot.setNumber}</span>
                                  <div className="flex-1 grid grid-cols-2 gap-2">
                                    <div className="relative">
                                      <input type="number" inputMode="decimal" step="0.5" value={slot.weight}
                                        onChange={(e) => setInp(`U:${ex.name}:${slot.setNumber}`, 'weight', e.target.value)}
                                        placeholder={slot.phW} className="field !py-1 text-center pr-7 text-sm" />
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">KG</span>
                                    </div>
                                    <div className="relative">
                                      <input type="number" inputMode="numeric" value={slot.reps}
                                        onChange={(e) => setInp(`U:${ex.name}:${slot.setNumber}`, 'reps', e.target.value)}
                                        placeholder={slot.phR} className="field !py-1 text-center pr-9 text-sm" />
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">Reps</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Working sets */}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2 nums">
                        <span>Working · {ex.sets} × {ex.reps} reps</span>
                        {ex.rest ? <span>{ex.rest}s rest</span> : null}
                      </div>

                      <div className="space-y-1">
                        {slots.map((slot) => {
                          if (slot.type === 'logged') {
                            const s = slot.set;
                            return (
                              <motion.div key={`l-${s.localId}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-2.5 py-1.5">
                                <button onClick={() => deleteSet(s)} title={s.pending ? 'Saved on this device — remove' : 'Remove set'}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors hover:bg-destructive/20 hover:text-destructive ${s.pending ? 'bg-volt-400/20 text-volt-400' : 'bg-success/20 text-success'}`}>
                                  <Check size={14} />
                                </button>
                                <span className="w-4 text-center text-xs text-muted-foreground nums">{s.setNumber}</span>
                                <div className="flex-1 grid grid-cols-2 gap-2">
                                  <div className="rounded-lg bg-secondary/50 py-1.5 text-center text-sm font-semibold nums">{s.weightKg}<span className="text-[10px] text-muted-foreground ml-1">KG</span></div>
                                  <div className="rounded-lg bg-secondary/50 py-1.5 text-center text-sm font-semibold nums">{s.actualReps}<span className="text-[10px] text-muted-foreground ml-1">Reps</span></div>
                                </div>
                                <span className="text-[10px] text-muted-foreground w-12 text-right nums">
                                  {s.pending ? <CloudOff size={11} className="inline text-volt-400/70" /> : `~${epley1RM(s.weightKg, s.actualReps)}`}
                                </span>
                              </motion.div>
                            );
                          }
                          const active = slot.setNumber === activeSetNumber;
                          return (
                            <div key={`p-${slot.setNumber}`} className={`relative flex items-center gap-2.5 py-1.5 rounded-lg ${active ? 'bg-brand-500/[0.06]' : ''}`}>
                              {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-1 h-6 rounded-full bg-success" />}
                              <button onClick={() => logWorking(ex, slot)} title="Mark set done"
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${active ? 'border-success text-success hover:bg-success/15' : 'border-border text-transparent hover:border-brand-400'}`}>
                                <Check size={13} />
                              </button>
                              <span className="w-4 text-center text-xs text-muted-foreground nums">{slot.setNumber}</span>
                              <div className="flex-1 grid grid-cols-2 gap-2">
                                <div className="relative">
                                  <input type="number" inputMode="decimal" step="0.5" value={slot.weight}
                                    onChange={(e) => setInp(`W:${ex.name}:${slot.setNumber}`, 'weight', e.target.value)}
                                    placeholder={slot.phW} className="field !py-1.5 text-center pr-7 text-sm" />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">KG</span>
                                </div>
                                <div className="relative">
                                  <input type="number" inputMode="numeric" value={slot.reps}
                                    onChange={(e) => setInp(`W:${ex.name}:${slot.setNumber}`, 'reps', e.target.value)}
                                    placeholder={slot.phR} className="field !py-1.5 text-center pr-9 text-sm" />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">Reps</span>
                                </div>
                              </div>
                              <span className="w-12" />
                            </div>
                          );
                        })}
                      </div>

                      <button onClick={() => addSetSlot(ex.name)}
                        className="w-full mt-2.5 py-2 rounded-lg bg-secondary/60 hover:bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5">
                        <Plus size={15} /> Add a set
                      </button>
                      {ex.notes && <p className="text-[11px] text-muted-foreground/70 mt-2 italic">{ex.notes}</p>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}

        {/* Off-plan logged exercises */}
        {offPlan.map((name) => (
          <Card key={name} className="p-3.5">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-9 h-9 rounded-lg bg-volt-400/15 text-volt-400 flex items-center justify-center flex-shrink-0"><Dumbbell size={16} /></span>
              <p className="font-semibold text-sm flex-1">{name} <span className="text-xs text-muted-foreground font-normal">extra</span></p>
              <span className="text-xs text-muted-foreground nums">{byExercise[name].length} sets</span>
            </div>
            <div className="space-y-1">
              {byExercise[name].map((s) => (
                <div key={s.localId} className="flex items-center gap-2.5 py-1 nums text-sm">
                  <span className="w-4 text-center text-xs text-muted-foreground">{s.setNumber}</span>
                  <span className="flex-1 font-semibold">{s.weightKg} kg × {s.actualReps}</span>
                  <button onClick={() => deleteSet(s)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => { setShowExtra(true); setExtra({ name, weight: '', reps: '' }); }} className="text-xs text-brand-400 hover:text-brand-300 mt-2 transition-colors">+ Add another set</button>
          </Card>
        ))}
      </div>

      {/* Log an off-plan exercise */}
      <Card className="p-3.5 mt-2.5">
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

      {/* Abandon */}
      <div className="pt-3">
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

      {/* Sticky action bar */}
      <div className="fixed left-0 right-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-5 px-4 z-30 pointer-events-none">
        <div className="max-w-lg mx-auto flex gap-2 pointer-events-auto">
          {expandedHasPending ? (
            <>
              <Button variant="secondary" size="lg" onClick={logAll} className="!px-3.5 shadow-lg" title="Log all remaining sets">
                <CheckSquare size={17} /> ALL
              </Button>
              <Button size="lg" onClick={logNext} className="flex-1 shadow-glow-brand uppercase tracking-wide font-semibold">
                <ListChecks size={17} /> Log next set
              </Button>
            </>
          ) : (
            <Button size="lg" onClick={completeSession} disabled={!working.length || completing}
              className="flex-1 !bg-success !bg-none !text-white shadow-lg">
              <CheckCircle2 size={18} /> {completing ? 'Saving…' : `Complete Session · ${working.length} sets`}
            </Button>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

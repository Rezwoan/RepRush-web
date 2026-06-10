'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mail, RotateCcw, Send, Trash2, Dumbbell, Weight, Activity, Calendar,
  Trophy, ClipboardList, Plus, Loader2,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { adminApi } from '@/lib/api';
import { getInitials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

const TT = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 };
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—');

export default function MemberDetailModal({
  userId, plans, onClose, onChanged,
}: {
  userId: number;
  plans: any[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [assignPlanId, setAssignPlanId] = useState('');

  const load = useCallback(() => adminApi.getUserDetail(userId).then((r) => setD(r.data)).catch(() => {}), [userId]);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, fn: () => Promise<any>, reload = false) => {
    setBusy(key);
    try { await fn(); if (reload) await load(); onChanged(); }
    catch (e) { console.error(e); }
    finally { setBusy(''); }
  };

  const assign = async () => {
    if (!assignPlanId) return;
    await act('assign', () => adminApi.assignPlan(parseInt(assignPlanId), userId), true);
    setAssignPlanId('');
  };

  const del = async () => {
    if (!confirm('Delete this member? This permanently removes their account and data.')) return;
    await act('delete', () => adminApi.deleteUser(userId));
    onClose();
  };

  const weekly = (d?.weeklyTotals || []).map((v: number, i: number, a: number[]) => ({ week: `W${i - a.length + 1 === 0 ? '' : ''}${i + 1}`, volume: Math.round(v) }));
  const bw = (d?.bodyWeight || []).map((w: any) => ({ date: w.date, weightKg: w.weightKg }));
  const bigThree = d ? [
    { name: 'Bench', kg: Math.round(d.lifts?.bench || 0) },
    { name: 'Squat', kg: Math.round(d.lifts?.squat || 0) },
    { name: 'Deadlift', kg: Math.round(d.lifts?.deadlift || 0) },
  ] : [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      >
        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }}
          transition={spring.soft}
          onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        >
          {!d ? (
            <div className="h-64 flex items-center justify-center"><div className="loader-ring" /></div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center text-base font-semibold overflow-hidden flex-shrink-0">
                  {d.profileImage ? <img src={d.profileImage} alt="" className="w-full h-full object-cover" /> : getInitials(d.name || d.email)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-display font-bold truncate">{d.name || d.email}</h2>
                    {d.isActivated
                      ? <span className="text-[10px] bg-success/15 text-success px-1.5 py-0.5 rounded">active</span>
                      : <span className="text-[10px] bg-volt-400/15 text-volt-400 px-1.5 py-0.5 rounded">pending</span>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{d.email}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 nums">
                    {d.heightCm ? `${d.heightCm}cm` : ''}{d.weightKg ? ` · ${d.weightKg}kg` : ''} · joined {fmtDate(d.createdAt)}
                  </p>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X size={18} /></button>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-3 gap-2.5">
                <Kpi icon={<Activity size={15} />} label="Sessions" value={d.sessionCount} />
                <Kpi icon={<Dumbbell size={15} />} label="Volume (kg)" value={(d.totalVolume || 0).toLocaleString()} accent="volt" />
                <Kpi icon={<Calendar size={15} />} label="Last active" value={d.lastActive ? fmtDate(d.lastActive) : '—'} small />
              </div>

              {/* Charts */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Panel title="Weekly volume" icon={<Activity size={14} />}>
                  {weekly.some((w: any) => w.volume > 0) ? (
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={weekly} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="week" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <Tooltip contentStyle={TT} cursor={{ fill: 'hsl(var(--secondary) / 0.4)' }} />
                        <Bar dataKey="volume" fill="#0a80f5" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <Empty>No volume logged yet</Empty>}
                </Panel>

                <Panel title="Body weight" icon={<Weight size={14} />}>
                  {bw.length >= 1 ? (
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={bw} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(x) => x.slice(5)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis domain={['auto', 'auto']} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <Tooltip contentStyle={TT} formatter={(v: any) => [`${v} kg`, 'Weight']} />
                        <Line type="monotone" dataKey="weightKg" stroke="#3b97f5" strokeWidth={2.5} dot={bw.length <= 4 ? { r: 3, fill: '#0a80f5' } : false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <Empty>No weight entries</Empty>}
                </Panel>
              </div>

              <Panel title="Estimated 1RM — Big Three" icon={<Dumbbell size={14} />}>
                {bigThree.some((b) => b.kg > 0) ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={bigThree} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} unit="kg" />
                      <Tooltip contentStyle={TT} cursor={{ fill: 'hsl(var(--secondary) / 0.4)' }} formatter={(v: any) => [`${v} kg`, '1RM']} />
                      <Bar dataKey="kg" radius={[5, 5, 0, 0]}>
                        {bigThree.map((_, i) => <Cell key={i} fill={['#0a80f5', '#3b97f5', '#faba0c'][i]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty>No lifts recorded</Empty>}
              </Panel>

              {/* Assigned plans */}
              <Panel title="Assigned plans" icon={<ClipboardList size={14} />}>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {d.assignedPlans?.length
                    ? d.assignedPlans.map((p: any) => <span key={p.id} className="text-xs bg-brand-500/15 text-brand-200 px-2.5 py-1 rounded-lg">{p.name}</span>)
                    : <span className="text-xs text-muted-foreground">No plans assigned</span>}
                </div>
                <div className="flex gap-2">
                  <select value={assignPlanId} onChange={(e) => setAssignPlanId(e.target.value)} className="field !py-2 text-sm flex-1">
                    <option value="">Assign a plan…</option>
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Button size="sm" onClick={assign} disabled={!assignPlanId || busy === 'assign'}>
                    {busy === 'assign' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Assign
                  </Button>
                </div>
              </Panel>

              {/* PRs + recent sessions */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Panel title="Personal records" icon={<Trophy size={14} />}>
                  {d.prs?.length ? (
                    <div className="space-y-1.5">
                      {d.prs.slice(0, 6).map((pr: any) => (
                        <div key={pr.id} className="flex items-center justify-between text-sm nums">
                          <span className="capitalize text-muted-foreground">{pr.exerciseType}</span>
                          <span className="font-semibold">{pr.weightKg}kg × {pr.reps}</span>
                        </div>
                      ))}
                    </div>
                  ) : <Empty>No PRs yet</Empty>}
                </Panel>

                <Panel title="Recent sessions" icon={<Calendar size={14} />}>
                  {d.sessions?.length ? (
                    <div className="space-y-1.5">
                      {d.sessions.slice(0, 6).map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground truncate">{s.workoutType || 'Workout'}</span>
                          <span className="text-xs nums">{fmtDate(s.startedAt)} · {s.sets} sets</span>
                        </div>
                      ))}
                    </div>
                  ) : <Empty>No sessions logged</Empty>}
                </Panel>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                <Button size="sm" variant="secondary" onClick={() => act('rep-w', () => adminApi.sendUserReport(userId, 'weekly'))} disabled={!!busy}>
                  {busy === 'rep-w' ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Weekly report
                </Button>
                <Button size="sm" variant="secondary" onClick={() => act('rep-m', () => adminApi.sendUserReport(userId, 'monthly'))} disabled={!!busy}>
                  {busy === 'rep-m' ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Monthly report
                </Button>
                {!d.isActivated && (
                  <Button size="sm" variant="secondary" onClick={() => act('resend', () => adminApi.resendInvite(userId))} disabled={!!busy}>
                    {busy === 'resend' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Resend invite
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => act('reset', () => adminApi.resetPassword(userId))} disabled={!!busy}>
                  {busy === 'reset' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Reset password
                </Button>
                <Button size="sm" variant="danger" onClick={del} disabled={!!busy} className="ml-auto">
                  <Trash2 size={14} /> Delete
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Kpi({ icon, label, value, accent, small }: { icon: React.ReactNode; label: string; value: any; accent?: 'volt'; small?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide ${accent === 'volt' ? 'text-volt-400' : 'text-brand-400'}`}>{icon}{label}</div>
      <p className={`font-display font-bold nums mt-1 ${small ? 'text-sm' : 'text-xl'}`}>{value}</p>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/20 p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">{icon}{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground py-6 text-center">{children}</p>;
}

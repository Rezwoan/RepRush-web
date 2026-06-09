'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Dumbbell, Plus, Mail, Trash2, RotateCcw, Shield, BarChart2,
  CheckCircle, Clock, Pencil, X, Save, Send,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { adminApi, exercisesApi } from '@/lib/api';
import { getInitials } from '@/lib/utils';
import { PageTransition, Stagger, Item } from '@/components/ui/motion-primitives';
import { Card, CardHeader } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { spring } from '@/lib/motion';

type Tab = 'overview' | 'users' | 'plans' | 'compare';

export default function AdminPage() {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [compareData, setCompareData] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '' });
  const [inviteStatus, setInviteStatus] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [planForm, setPlanForm] = useState({ name: '', json: '' });
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [planStatus, setPlanStatus] = useState('');
  const [reportStatus, setReportStatus] = useState<Record<number, string>>({});

  const reload = () => {
    adminApi.getStats().then((r) => setStats(r.data));
    adminApi.getUsers().then((r) => setUsers(r.data));
    exercisesApi.getAllPlans().then((r) => setPlans(r.data));
  };
  useEffect(() => { reload(); }, []);

  const inviteUser = async () => {
    if (!inviteForm.email) return;
    try {
      await adminApi.inviteUser(inviteForm.email, inviteForm.name);
      setInviteStatus(`Invitation sent to ${inviteForm.email}`);
      setInviteForm({ email: '', name: '' });
      reload();
    } catch (e: any) {
      setInviteStatus(`Error: ${e?.response?.data?.message || 'Failed to invite'}`);
    }
    setTimeout(() => setInviteStatus(''), 5000);
  };

  const resetPassword = async (id: number) => {
    if (!confirm("Reset this user's password?")) return;
    await adminApi.resetPassword(id);
    alert('Password reset and emailed to user.');
  };
  const deleteUser = async (id: number) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    await adminApi.deleteUser(id);
    reload();
  };
  const loadComparison = async () => {
    if (selectedUsers.length < 2) return;
    const res = await adminApi.compare(selectedUsers);
    setCompareData(res.data);
  };
  const startEditPlan = (p: any) => { setEditingPlanId(p.id); setPlanForm({ name: p.name, json: JSON.stringify(p.exercises, null, 2) }); setPlanStatus(''); };
  const cancelEditPlan = () => { setEditingPlanId(null); setPlanForm({ name: '', json: '' }); setPlanStatus(''); };
  const savePlan = async () => {
    if (!planForm.name || !planForm.json) return;
    try {
      const exercises = JSON.parse(planForm.json);
      if (editingPlanId !== null) { await adminApi.updatePlan(editingPlanId, { name: planForm.name, exercises }); setPlanStatus('Plan updated successfully'); setEditingPlanId(null); }
      else { await adminApi.createPlan(planForm.name, exercises); setPlanStatus('Plan created successfully'); }
      setPlanForm({ name: '', json: '' });
      reload();
    } catch { setPlanStatus('Error: Invalid JSON or request failed'); }
    setTimeout(() => setPlanStatus(''), 4000);
  };
  const deletePlan = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This will remove it from all users.`)) return;
    try { await adminApi.deletePlan(id); reload(); } catch { alert('Failed to delete plan.'); }
  };
  const resendInvite = async (userId: number) => {
    setReportStatus({ ...reportStatus, [userId]: 'Resending…' });
    try { await adminApi.resendInvite(userId); setReportStatus({ ...reportStatus, [userId]: 'Invite resent ✓' }); }
    catch (e: any) { setReportStatus({ ...reportStatus, [userId]: e?.response?.data?.message || 'Resend failed' }); }
    setTimeout(() => setReportStatus((s) => { const n = { ...s }; delete n[userId]; return n; }), 4000);
  };
  const sendReport = async (userId: number, period: 'weekly' | 'monthly') => {
    setReportStatus({ ...reportStatus, [userId]: 'Sending...' });
    try { await adminApi.sendUserReport(userId, period); setReportStatus({ ...reportStatus, [userId]: `${period} report sent` }); }
    catch { setReportStatus({ ...reportStatus, [userId]: 'Send failed' }); }
    setTimeout(() => setReportStatus((s) => { const n = { ...s }; delete n[userId]; return n; }), 4000);
  };
  const assignToAll = async (planId: number) => {
    await adminApi.assignPlanToAll(planId, users.map((u) => u.id));
    alert('Plan assigned to all users!');
  };

  const chartData = compareData.map((u) => ({
    name: u.name, Bench: Math.round(u.lifts.bench), Squat: Math.round(u.lifts.squat), Deadlift: Math.round(u.lifts.deadlift),
  }));

  const tabs = [
    { key: 'overview' as Tab, label: 'Overview', icon: <Shield size={15} /> },
    { key: 'users' as Tab, label: 'Users', icon: <Users size={15} /> },
    { key: 'plans' as Tab, label: 'Plans', icon: <Dumbbell size={15} /> },
    { key: 'compare' as Tab, label: 'Compare', icon: <BarChart2 size={15} /> },
  ];

  return (
    <PageTransition className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-display font-extrabold tracking-tight flex items-center gap-2">
        <Shield size={22} className="text-brand-400" /> Admin Panel
      </h1>

      <div className="flex gap-1 bg-secondary rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === t.key ? 'text-white' : 'text-muted-foreground hover:text-foreground'}`}>
            {activeTab === t.key && <motion.span layoutId="admin-tab" transition={spring.snappy} className="absolute inset-0 rounded-lg bg-brand-gradient" />}
            <span className="relative z-10">{t.icon}</span>
            <span className="relative z-10">{t.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.soft}>
          {/* Overview */}
          {activeTab === 'overview' && stats && (
            <div className="space-y-4">
              <Stagger className="grid grid-cols-3 gap-4">
                <StatCard accent="brand" icon={<Users size={18} />} label="Total Members" value={<AnimatedNumber value={stats.totalUsers} />} />
                <StatCard accent="success" icon={<CheckCircle size={18} />} label="Active Members" value={<AnimatedNumber value={stats.activeUsers} />} />
                <StatCard accent="volt" icon={<Clock size={18} />} label="Pending Activation" value={<AnimatedNumber value={stats.pendingActivation} />} />
              </Stagger>
              <Button onClick={() => setActiveTab('users')}><Mail size={15} /> Invite a New Member</Button>
            </div>
          )}

          {/* Users */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <Card className="p-5 border-brand-500/30">
                <CardHeader icon={<Mail size={16} />} title="Invite New Member" />
                <p className="text-xs text-muted-foreground mb-3 -mt-2">An invitation email with login credentials will be sent to the new member.</p>
                <AnimatePresence>
                  {inviteStatus && (
                    <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className={`text-sm mb-3 ${inviteStatus.startsWith('Error') ? 'text-destructive' : 'text-success'}`}>{inviteStatus}</motion.p>
                  )}
                </AnimatePresence>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} placeholder="Full name" className="field flex-1" />
                  <input value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="Email address" type="email" className="field flex-1" />
                  <Button onClick={inviteUser} className="whitespace-nowrap"><Mail size={14} /> Send Invite</Button>
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="font-semibold nums">{users.length} Members</h2>
                  {users.some((u) => !u.isActivated) && (
                    <span className="text-xs text-volt-400 flex items-center gap-1"><Clock size={12} /> Some invites pending</span>
                  )}
                </div>
                {users.length === 0 ? (
                  <div className="px-5 py-10 text-center text-muted-foreground text-sm">No members yet. Use the form above to invite your first member.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {users.map((u) => (
                      <div key={u.id} className="px-5 py-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold overflow-hidden flex-shrink-0">
                          {u.profileImage ? <img src={u.profileImage} alt={u.name} className="w-full h-full object-cover" /> : getInitials(u.name || u.email)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{u.name || u.email}</p>
                            {!u.isActivated && <span className="text-xs bg-volt-400/15 text-volt-400 px-1.5 py-0.5 rounded">pending</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 nums">
                            {u.heightCm && `${u.heightCm}cm`}{u.weightKg && ` · ${u.weightKg}kg`}
                            {u.lifts && ` · B:${Math.round(u.lifts.bench)} S:${Math.round(u.lifts.squat)} D:${Math.round(u.lifts.deadlift)}`}
                          </p>
                        </div>
                        <div className="text-xs text-center"><div className="text-muted-foreground nums">{u.onboardingPercent}%</div><div className="text-[10px] text-muted-foreground">profile</div></div>
                        <div className="flex items-center gap-1">
                          {reportStatus[u.id] ? <span className="text-xs text-brand-400 px-2">{reportStatus[u.id]}</span> : (
                            <>
                              <button onClick={() => sendReport(u.id, 'weekly')} className="p-1.5 text-xs text-muted-foreground hover:text-brand-400 border border-border rounded-lg transition-colors" title="Weekly report">W</button>
                              <button onClick={() => sendReport(u.id, 'monthly')} className="p-1.5 text-xs text-muted-foreground hover:text-brand-400 border border-border rounded-lg transition-colors" title="Monthly report">M</button>
                            </>
                          )}
                          {!u.isActivated && !reportStatus[u.id] && (
                            <button onClick={() => resendInvite(u.id)} className="p-2 text-muted-foreground hover:text-volt-400 transition-colors" title="Resend invite email"><Send size={14} /></button>
                          )}
                          <button onClick={() => resetPassword(u.id)} className="p-2 text-muted-foreground hover:text-brand-400 transition-colors" title="Reset password"><RotateCcw size={14} /></button>
                          <button onClick={() => deleteUser(u.id)} className="p-2 text-muted-foreground hover:text-destructive transition-colors" title="Delete member"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* Plans */}
          {activeTab === 'plans' && (
            <div className="space-y-4">
              <Card className={`p-5 space-y-3 ${editingPlanId !== null ? 'border-brand-500/50' : ''}`}>
                <h2 className="font-semibold flex items-center gap-2">
                  {editingPlanId !== null ? <><Pencil size={15} className="text-brand-400" /> Edit Plan</> : <><Plus size={15} className="text-brand-400" /> Create Exercise Plan</>}
                </h2>
                {planStatus && <p className={`text-sm ${planStatus.startsWith('Error') ? 'text-destructive' : 'text-success'}`}>{planStatus}</p>}
                <input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Plan name (e.g. Push Day)" className="field" />
                <textarea value={planForm.json} onChange={(e) => setPlanForm({ ...planForm, json: e.target.value })}
                  placeholder={`Paste exercise JSON here:\n{\n  "type": "Push Day",\n  "exercises": [ ... ]\n}`} rows={8} className="field font-mono resize-y" />
                <div className="flex gap-2">
                  <Button onClick={savePlan}><Save size={14} /> {editingPlanId !== null ? 'Save Changes' : 'Create Plan'}</Button>
                  {editingPlanId !== null && <Button variant="secondary" onClick={cancelEditPlan}><X size={14} /> Cancel</Button>}
                </div>
              </Card>

              {plans.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground text-sm">No plans yet. Create one above.</Card>
              ) : (
                <Stagger className="space-y-3">
                  {plans.map((p: any) => (
                    <Item key={p.id}>
                      <Card className={`p-4 ${editingPlanId === p.id ? 'border-brand-500/50' : ''}`}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold">{p.name}</h3>
                          <div className="flex items-center gap-1">
                            <button onClick={() => assignToAll(p.id)} className="text-xs text-brand-400 hover:text-brand-300 border border-brand-500/30 px-3 py-1 rounded-lg transition-colors">Assign to all</button>
                            <button onClick={() => startEditPlan(p)} className="p-2 text-muted-foreground hover:text-brand-400 transition-colors" title="Edit plan"><Pencil size={14} /></button>
                            <button onClick={() => deletePlan(p.id, p.name)} className="p-2 text-muted-foreground hover:text-destructive transition-colors" title="Delete plan"><Trash2 size={14} /></button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground nums">{p.exercises?.exercises?.length || 0} exercises</p>
                        {p.exercises?.exercises?.map((ex: any) => (
                          <div key={ex.id} className="text-xs text-muted-foreground mt-1 nums">• {ex.name} — {ex.sets}×{ex.reps}</div>
                        ))}
                      </Card>
                    </Item>
                  ))}
                </Stagger>
              )}
            </div>
          )}

          {/* Compare */}
          {activeTab === 'compare' && (
            <div className="space-y-4">
              <Card className="p-5">
                <CardHeader title="Select members to compare" />
                <div className="flex flex-wrap gap-2 mb-4">
                  {users.map((u) => {
                    const sel = selectedUsers.includes(u.id);
                    return (
                      <motion.button key={u.id} whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedUsers((prev) => sel ? prev.filter((id) => id !== u.id) : [...prev, u.id])}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${sel ? 'bg-brand-500/20 border-brand-500/50 text-brand-200' : 'bg-secondary border-border text-muted-foreground'}`}>
                        {u.name || u.email}
                      </motion.button>
                    );
                  })}
                </div>
                <Button onClick={loadComparison} disabled={selectedUsers.length < 2}>Compare ({selectedUsers.length} selected)</Button>
              </Card>

              {chartData.length > 0 && (
                <Card className="p-5">
                  <CardHeader title="Big Three Comparison (1RM estimates)" />
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} unit="kg" />
                      <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} cursor={{ fill: 'hsl(var(--secondary) / 0.4)' }} />
                      <Legend />
                      <Bar dataKey="Bench" fill="#0a80f5" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Squat" fill="#7fb2f5" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Deadlift" fill="#faba0c" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </PageTransition>
  );
}

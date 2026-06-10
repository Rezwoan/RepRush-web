'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Dumbbell, Plus, Mail, Trash2, Shield, BarChart2, TrendingUp,
  CheckCircle, Clock, Pencil, X, Save, Send, LogOut, Search, Copy, UserPlus,
  Activity, Zap, RefreshCw, Layers, ChevronRight, Flame, Trophy,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { adminApi, exercisesApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getInitials } from '@/lib/utils';
import { Logo } from '@/components/ui/logo';
import { PageTransition, Stagger, Item } from '@/components/ui/motion-primitives';
import { Card, CardHeader } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { spring } from '@/lib/motion';
import MemberDetailModal from '@/components/admin/member-detail-modal';
import AssignPlanModal from '@/components/admin/assign-plan-modal';

type Tab = 'overview' | 'members' | 'plans' | 'insights';
type SortKey = 'recent' | 'name' | 'onboarding' | 'volume';
type FilterKey = 'all' | 'active' | 'pending';

const TT = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 };
const SERIES = ['#0a80f5', '#faba0c', '#34d399', '#f472b6', '#a78bfa', '#fb923c'];
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');
const timeAgo = (d?: string) => {
  if (!d) return 'never';
  const diff = Date.now() - new Date(d).getTime();
  const day = 864e5;
  if (diff < day) return 'today';
  if (diff < 2 * day) return 'yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}w ago`;
  return fmtDate(d);
};

export default function AdminPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [refreshing, setRefreshing] = useState(false);

  // members tab
  const [userSearch, setUserSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [detailId, setDetailId] = useState<number | null>(null);

  // invite
  const [inviteForm, setInviteForm] = useState({ email: '', name: '' });
  const [inviteStatus, setInviteStatus] = useState('');

  // plans
  const [planForm, setPlanForm] = useState({ name: '', json: '' });
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [planStatus, setPlanStatus] = useState('');
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [assignPlan, setAssignPlan] = useState<any>(null);

  // insights
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [compareData, setCompareData] = useState<any[]>([]);

  const handleLogout = async () => { await logout(); router.replace('/login'); };

  const reload = async () => {
    setRefreshing(true);
    await Promise.all([
      adminApi.getStats().then((r) => setStats(r.data)).catch(() => {}),
      adminApi.getActivity().then((r) => setActivity(r.data)).catch(() => {}),
      adminApi.getUsers().then((r) => setUsers(r.data)).catch(() => {}),
      exercisesApi.getAllPlans().then((r) => setPlans(r.data)).catch(() => {}),
    ]);
    setRefreshing(false);
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

  // ── plans ──
  const startEditPlan = (p: any) => { setEditingPlanId(p.id); setPlanForm({ name: p.name, json: JSON.stringify(p.exercises, null, 2) }); setShowPlanEditor(true); setPlanStatus(''); };
  const newPlan = () => { setEditingPlanId(null); setPlanForm({ name: '', json: '' }); setShowPlanEditor(true); setPlanStatus(''); };
  const cancelEditPlan = () => { setEditingPlanId(null); setPlanForm({ name: '', json: '' }); setShowPlanEditor(false); setPlanStatus(''); };
  const savePlan = async () => {
    if (!planForm.name || !planForm.json) return;
    try {
      const exercises = JSON.parse(planForm.json);
      if (editingPlanId !== null) { await adminApi.updatePlan(editingPlanId, { name: planForm.name, exercises }); setPlanStatus('Plan updated'); }
      else { await adminApi.createPlan(planForm.name, exercises); setPlanStatus('Plan created'); }
      cancelEditPlan();
      reload();
    } catch { setPlanStatus('Error: Invalid JSON or request failed'); }
    setTimeout(() => setPlanStatus(''), 4000);
  };
  const duplicatePlan = async (p: any) => {
    try { await adminApi.createPlan(`${p.name} (copy)`, p.exercises); reload(); } catch { alert('Failed to duplicate.'); }
  };
  const deletePlan = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This removes it from all members.`)) return;
    try { await adminApi.deletePlan(id); reload(); } catch { alert('Failed to delete plan.'); }
  };

  const loadComparison = async () => {
    if (selectedUsers.length < 2) return;
    const res = await adminApi.compare(selectedUsers);
    setCompareData(res.data);
  };

  // ── derived ──
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    let list = users.filter((u) => {
      if (filterKey === 'active' && !u.isActivated) return false;
      if (filterKey === 'pending' && u.isActivated) return false;
      return !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    });
    list = [...list].sort((a, b) => {
      if (sortKey === 'name') return (a.name || a.email).localeCompare(b.name || b.email);
      if (sortKey === 'onboarding') return (b.onboardingPercent || 0) - (a.onboardingPercent || 0);
      if (sortKey === 'volume') return (b.totalVolume || 0) - (a.totalVolume || 0);
      // recent
      return new Date(b.lastActive || 0).getTime() - new Date(a.lastActive || 0).getTime();
    });
    return list;
  }, [users, userSearch, filterKey, sortKey]);

  const compareBig = compareData.map((u) => ({ name: u.name, Bench: Math.round(u.lifts.bench), Squat: Math.round(u.lifts.squat), Deadlift: Math.round(u.lifts.deadlift) }));
  const compareTrend = useMemo(() => {
    if (!compareData.length) return [];
    const len = compareData[0].weeklyTotals?.length || 0;
    return Array.from({ length: len }, (_, i) => {
      const row: any = { week: `W${i + 1}` };
      compareData.forEach((u) => { row[u.name] = Math.round(u.weeklyTotals?.[i] || 0); });
      return row;
    });
  }, [compareData]);

  const tabs = [
    { key: 'overview' as Tab, label: 'Overview', icon: <Shield size={15} /> },
    { key: 'members' as Tab, label: 'Members', icon: <Users size={15} /> },
    { key: 'plans' as Tab, label: 'Plans', icon: <Dumbbell size={15} /> },
    { key: 'insights' as Tab, label: 'Insights', icon: <BarChart2 size={15} /> },
  ];

  return (
    <PageTransition className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo size="sm" withText={false} />
          <div>
            <h1 className="text-xl lg:text-2xl font-display font-extrabold tracking-tight flex items-center gap-2">
              <Shield size={18} className="text-brand-400" /> Admin Console
            </h1>
            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={reload} disabled={refreshing} title="Refresh">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </Button>
          <Button variant="secondary" size="sm" onClick={handleLogout}><LogOut size={15} /> Sign out</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === t.key ? 'text-white' : 'text-muted-foreground hover:text-foreground'}`}>
            {activeTab === t.key && <motion.span layoutId="admin-tab" transition={spring.snappy} className="absolute inset-0 rounded-lg bg-brand-gradient" />}
            <span className="relative z-10">{t.icon}</span>
            <span className="relative z-10">{t.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.soft}>

          {/* ───────── Overview ───────── */}
          {activeTab === 'overview' && stats && (
            <div className="space-y-5">
              <Stagger className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <StatCard accent="brand" icon={<Users size={18} />} label="Members" value={<AnimatedNumber value={stats.totalUsers} />} />
                <StatCard accent="success" icon={<CheckCircle size={18} />} label="Active" value={<AnimatedNumber value={stats.activeUsers} />} />
                <StatCard accent="volt" icon={<Clock size={18} />} label="Pending" value={<AnimatedNumber value={stats.pendingActivation} />} />
                <StatCard accent="brand" icon={<Zap size={18} />} label="Sessions / week" value={<AnimatedNumber value={stats.sessionsThisWeek} />} />
                <StatCard accent="volt" icon={<Dumbbell size={18} />} label="Volume / week" value={<><AnimatedNumber value={stats.volumeThisWeek} /><span className="text-sm text-muted-foreground">kg</span></>} />
                <StatCard accent="success" icon={<Layers size={18} />} label="Plans" value={<AnimatedNumber value={stats.totalPlans} />} />
              </Stagger>

              {/* Activity chart */}
              <Item standalone>
                <Card className="p-5">
                  <CardHeader icon={<Activity size={16} />} title="Training activity"
                    action={<span className="text-xs text-muted-foreground">last 30 days · {stats.activeThisWeek} active this week</span>} />
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={activity?.perDay || []} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                      <defs>
                        <linearGradient id="act" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0a80f5" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#0a80f5" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
                      <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <Tooltip contentStyle={TT} formatter={(v: any) => [`${v} sessions`, '']} labelFormatter={(l) => fmtDate(l)} />
                      <Area type="monotone" dataKey="sessions" stroke="#0a80f5" strokeWidth={2.5} fill="url(#act)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              </Item>

              <div className="grid lg:grid-cols-2 gap-4">
                {/* Top members */}
                <Item standalone>
                  <Card className="p-5 h-full">
                    <CardHeader accent="volt" icon={<Trophy size={16} />} title="Most active" action={<span className="text-xs text-muted-foreground">30 days</span>} />
                    {activity?.topMembers?.length ? (
                      <div className="space-y-2.5">
                        {activity.topMembers.map((m: any, i: number) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-volt-400/20 text-volt-400' : 'bg-secondary text-muted-foreground'}`}>{i + 1}</span>
                            <span className="flex-1 text-sm font-medium truncate">{m.name}</span>
                            <span className="text-xs text-muted-foreground nums">{m.sessions} sessions · {m.volume.toLocaleString()}kg</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-sm text-muted-foreground py-6 text-center">No activity in the last 30 days.</p>}
                  </Card>
                </Item>

                {/* Recent feed */}
                <Item standalone>
                  <Card className="p-5 h-full">
                    <CardHeader icon={<Flame size={16} />} title="Recent activity" />
                    {activity?.recent?.length ? (
                      <div className="space-y-2">
                        {activity.recent.slice(0, 8).map((s: any, i: number) => (
                          <div key={i} className="flex items-center gap-2.5 text-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0" />
                            <span className="font-medium truncate">{s.name}</span>
                            <span className="text-muted-foreground truncate">· {s.workoutType || 'Workout'}</span>
                            <span className="ml-auto text-xs text-muted-foreground nums whitespace-nowrap">{timeAgo(s.startedAt)}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-sm text-muted-foreground py-6 text-center">No sessions logged yet.</p>}
                  </Card>
                </Item>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setActiveTab('members')}><UserPlus size={15} /> Invite a member</Button>
                <Button variant="secondary" onClick={() => { setActiveTab('plans'); newPlan(); }}><Plus size={15} /> Create a plan</Button>
              </div>
            </div>
          )}

          {/* ───────── Members ───────── */}
          {activeTab === 'members' && (
            <div className="space-y-4">
              {/* Invite */}
              <Card className="p-5 border-brand-500/30">
                <CardHeader icon={<Mail size={16} />} title="Invite new member" />
                <p className="text-xs text-muted-foreground mb-3 -mt-2">An invitation email with login credentials will be sent.</p>
                <AnimatePresence>
                  {inviteStatus && (
                    <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className={`text-sm mb-3 ${inviteStatus.startsWith('Error') ? 'text-destructive' : 'text-success'}`}>{inviteStatus}</motion.p>
                  )}
                </AnimatePresence>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} placeholder="Full name" className="field flex-1" />
                  <input value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="Email address" type="email" className="field flex-1" />
                  <Button onClick={inviteUser} className="whitespace-nowrap"><Send size={14} /> Send invite</Button>
                </div>
              </Card>

              {/* Toolbar */}
              <Card className="overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[160px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search members…" className="field !py-2 pl-9 text-sm w-full" />
                  </div>
                  <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
                    {(['all', 'active', 'pending'] as FilterKey[]).map((f) => (
                      <button key={f} onClick={() => setFilterKey(f)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${filterKey === f ? 'bg-card text-foreground shadow' : 'text-muted-foreground'}`}>{f}</button>
                    ))}
                  </div>
                  <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="field !py-2 text-xs !w-auto">
                    <option value="recent">Recent activity</option>
                    <option value="name">Name</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="volume">Volume</option>
                  </select>
                </div>

                {filteredUsers.length === 0 ? (
                  <div className="px-5 py-10 text-center text-muted-foreground text-sm">No members match.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredUsers.map((u) => (
                      <button key={u.id} onClick={() => setDetailId(u.id)} className="w-full px-4 py-3.5 flex items-center gap-3.5 text-left hover:bg-secondary/40 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold overflow-hidden flex-shrink-0">
                          {u.profileImage ? <img src={u.profileImage} alt="" className="w-full h-full object-cover" /> : getInitials(u.name || u.email)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{u.name || u.email}</p>
                            {!u.isActivated && <span className="text-[10px] bg-volt-400/15 text-volt-400 px-1.5 py-0.5 rounded">pending</span>}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="h-1.5 w-20 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full bg-brand-gradient rounded-full" style={{ width: `${u.onboardingPercent || 0}%` }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground nums">{u.onboardingPercent || 0}%</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs nums font-medium">{u.sessionCount || 0} sessions</p>
                          <p className="text-[10px] text-muted-foreground nums">active {timeAgo(u.lastActive)}</p>
                        </div>
                        <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ───────── Plans ───────── */}
          {activeTab === 'plans' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold nums">{plans.length} plans</h2>
                <Button size="sm" onClick={newPlan}><Plus size={15} /> New plan</Button>
              </div>

              <AnimatePresence>
                {showPlanEditor && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <Card className="p-5 space-y-3 border-brand-500/40">
                      <h2 className="font-semibold flex items-center gap-2">
                        {editingPlanId !== null ? <><Pencil size={15} className="text-brand-400" /> Edit plan</> : <><Plus size={15} className="text-brand-400" /> Create plan</>}
                      </h2>
                      {planStatus && <p className={`text-sm ${planStatus.startsWith('Error') ? 'text-destructive' : 'text-success'}`}>{planStatus}</p>}
                      <input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Plan name (e.g. Push Day)" className="field" />
                      <textarea value={planForm.json} onChange={(e) => setPlanForm({ ...planForm, json: e.target.value })}
                        placeholder={`{\n  "type": "Push Day",\n  "focus": "Chest, Shoulders, Triceps",\n  "exercises": [\n    { "name": "Bench Press", "sets": 3, "reps": "5-8", "estimatedLoad": "60kg", "warmUpSets": ["40kg x 8"], "rest": 180 }\n  ]\n}`}
                        rows={10} className="field font-mono text-xs resize-y" />
                      <div className="flex gap-2">
                        <Button onClick={savePlan}><Save size={14} /> {editingPlanId !== null ? 'Save changes' : 'Create plan'}</Button>
                        <Button variant="secondary" onClick={cancelEditPlan}><X size={14} /> Cancel</Button>
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {plans.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground text-sm">No plans yet. Create one above.</Card>
              ) : (
                <Stagger className="grid sm:grid-cols-2 gap-3">
                  {plans.map((p: any) => {
                    const exs = p.exercises?.exercises || [];
                    return (
                      <Item key={p.id}>
                        <Card className="p-4 h-full flex flex-col">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0">
                              <h3 className="font-semibold truncate">{p.name}</h3>
                              {p.exercises?.focus && <p className="text-xs text-muted-foreground truncate">{p.exercises.focus}</p>}
                            </div>
                            <span className="text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full nums flex-shrink-0">{exs.length} ex</span>
                          </div>
                          <div className="flex-1 space-y-0.5 my-2">
                            {exs.slice(0, 5).map((ex: any, i: number) => (
                              <div key={i} className="text-xs text-muted-foreground nums flex items-center gap-1.5">
                                <span className="truncate">• {ex.name}</span>
                                <span className="text-muted-foreground/60 flex-shrink-0">{ex.sets}×{ex.reps}</span>
                                {ex.warmUpSets?.some((w: string) => /x/i.test(w)) && <Flame size={9} className="text-volt-400/70 flex-shrink-0" />}
                              </div>
                            ))}
                            {exs.length > 5 && <p className="text-[11px] text-muted-foreground/60">+{exs.length - 5} more</p>}
                          </div>
                          <div className="flex items-center gap-1 pt-2 border-t border-border">
                            <Button size="sm" variant="secondary" className="flex-1" onClick={() => setAssignPlan(p)}><UserPlus size={13} /> Assign</Button>
                            <button onClick={() => startEditPlan(p)} className="p-2 text-muted-foreground hover:text-brand-400 transition-colors" title="Edit"><Pencil size={14} /></button>
                            <button onClick={() => duplicatePlan(p)} className="p-2 text-muted-foreground hover:text-brand-400 transition-colors" title="Duplicate"><Copy size={14} /></button>
                            <button onClick={() => deletePlan(p.id, p.name)} className="p-2 text-muted-foreground hover:text-destructive transition-colors" title="Delete"><Trash2 size={14} /></button>
                          </div>
                        </Card>
                      </Item>
                    );
                  })}
                </Stagger>
              )}
            </div>
          )}

          {/* ───────── Insights ───────── */}
          {activeTab === 'insights' && (
            <div className="space-y-4">
              <Card className="p-5">
                <CardHeader icon={<BarChart2 size={16} />} title="Compare members" action={<span className="text-xs text-muted-foreground">{selectedUsers.length} selected</span>} />
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
                <Button onClick={loadComparison} disabled={selectedUsers.length < 2}><TrendingUp size={15} /> Compare ({selectedUsers.length})</Button>
              </Card>

              {compareBig.length > 0 && (
                <>
                  <Card className="p-5">
                    <CardHeader title="Big Three — estimated 1RM" />
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={compareBig}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} unit="kg" />
                        <Tooltip contentStyle={TT} cursor={{ fill: 'hsl(var(--secondary) / 0.4)' }} />
                        <Legend />
                        <Bar dataKey="Bench" fill="#0a80f5" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Squat" fill="#3b97f5" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Deadlift" fill="#faba0c" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>

                  <Card className="p-5">
                    <CardHeader accent="volt" title="Weekly volume trend" action={<span className="text-xs text-muted-foreground">last 8 weeks</span>} />
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={compareTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="week" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <Tooltip contentStyle={TT} />
                        <Legend />
                        {compareData.map((u, i) => (
                          <Line key={u.userId} type="monotone" dataKey={u.name} stroke={SERIES[i % SERIES.length]} strokeWidth={2.5} dot={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                </>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Modals */}
      {detailId !== null && (
        <MemberDetailModal userId={detailId} plans={plans} onClose={() => setDetailId(null)} onChanged={reload} />
      )}
      {assignPlan && (
        <AssignPlanModal plan={assignPlan} users={users} onClose={() => setAssignPlan(null)} onDone={reload} />
      )}
    </PageTransition>
  );
}

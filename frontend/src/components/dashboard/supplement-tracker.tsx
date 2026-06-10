'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pill, Plus, Trash2, X, Check, Pencil } from 'lucide-react';
import { supplementsApi } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

interface SuppLog { id: number; amount: number; loggedAt: string }
interface Supp {
  id: number; name: string; unit: string; color: string | null;
  defaultDose: number | null; dailyTarget: number | null;
  totalToday: number; logs: SuppLog[];
}

const UNITS = ['mg', 'mcg', 'g', 'IU', 'ml', 'capsule', 'tablet', 'drop'];
const COLORS = ['#a78bfa', '#22d3ee', '#faba0c', '#34d399', '#f472b6', '#60a5fa', '#fb923c', '#f87171', '#a3e635', '#e879f9', '#2dd4bf', '#fbbf24'];
const PRESETS = [
  { name: 'Magnesium', unit: 'mg', defaultDose: 400, dailyTarget: 400, color: '#a78bfa' },
  { name: 'Omega-3 Fish Oil', unit: 'mg', defaultDose: 1000, dailyTarget: 1000, color: '#22d3ee' },
  { name: 'Vitamin D3', unit: 'IU', defaultDose: 2000, dailyTarget: 2000, color: '#faba0c' },
];
const fmt = (n: number) => (Number.isInteger(n) ? n : Number(n.toFixed(1)));
const blankForm = { name: '', unit: 'mg', defaultDose: '', dailyTarget: '', color: COLORS[0] };

export default function SupplementTracker({ onChange }: { onChange?: () => void }) {
  const [items, setItems] = useState<Supp[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(blankForm);
  const [customFor, setCustomFor] = useState<number | null>(null);
  const [customAmt, setCustomAmt] = useState('');
  const [editLog, setEditLog] = useState<{ id: number; amount: string } | null>(null);

  const reload = useCallback(() => {
    supplementsApi.getToday().then((r) => setItems(r.data)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const after = () => { reload(); onChange?.(); };

  const log = async (id: number, amount: number) => {
    if (!amount || amount <= 0) return;
    await supplementsApi.logDose(id, amount);
    setCustomFor(null); setCustomAmt('');
    after();
  };
  const saveLogEdit = async () => {
    if (!editLog) return;
    const a = parseFloat(editLog.amount);
    if (a > 0) await supplementsApi.updateLog(editLog.id, a);
    setEditLog(null);
    after();
  };
  const delLog = async (logId: number) => { await supplementsApi.deleteLog(logId); after(); };

  const addSupp = async (preset?: typeof PRESETS[number]) => {
    const data = preset
      ? { name: preset.name, unit: preset.unit, defaultDose: preset.defaultDose, dailyTarget: preset.dailyTarget, color: preset.color }
      : {
          name: form.name.trim(), unit: form.unit, color: form.color,
          defaultDose: form.defaultDose ? parseFloat(form.defaultDose) : undefined,
          dailyTarget: form.dailyTarget ? parseFloat(form.dailyTarget) : undefined,
        };
    if (!data.name) return;
    await supplementsApi.add(data);
    setForm(blankForm); setAdding(false);
    after();
  };

  const openEdit = (s: Supp) => {
    setEditId(s.id);
    setEditForm({ name: s.name, unit: s.unit, defaultDose: s.defaultDose ? String(s.defaultDose) : '', dailyTarget: s.dailyTarget ? String(s.dailyTarget) : '', color: s.color || COLORS[0] });
  };
  const saveEdit = async () => {
    if (editId == null) return;
    await supplementsApi.update(editId, {
      name: editForm.name.trim(), unit: editForm.unit, color: editForm.color,
      defaultDose: editForm.defaultDose ? parseFloat(editForm.defaultDose) : null as any,
      dailyTarget: editForm.dailyTarget ? parseFloat(editForm.dailyTarget) : null as any,
    });
    setEditId(null);
    after();
  };
  const removeSupp = async (id: number, name: string) => {
    if (!confirm(`Remove "${name}" and its logs?`)) return;
    await supplementsApi.remove(id);
    setEditId(null);
    after();
  };

  const missingPresets = PRESETS.filter((p) => !items.some((i) => i.name.toLowerCase() === p.name.toLowerCase()));

  const ColorPicker = ({ value, onPick }: { value: string; onPick: (c: string) => void }) => (
    <div className="flex flex-wrap gap-1.5">
      {COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onPick(c)}
          className={`w-6 h-6 rounded-full transition-transform ${value === c ? 'ring-2 ring-offset-2 ring-offset-card ring-foreground scale-110' : ''}`}
          style={{ background: c }} />
      ))}
    </div>
  );

  return (
    <Card className="p-5">
      <CardHeader accent="brand" icon={<Pill size={18} />} title="Supplements"
        action={<button onClick={() => setAdding((v) => !v)} className="text-xs font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"><Plus size={14} /> Add</button>} />

      {/* Add form */}
      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mb-4 p-3 rounded-xl border border-border bg-secondary/40 space-y-2.5">
              {missingPresets.length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1.5">Quick add</p>
                  <div className="flex flex-wrap gap-1.5">
                    {missingPresets.map((p) => (
                      <button key={p.name} onClick={() => addSupp(p)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium border border-border bg-secondary hover:border-brand-500/40 hover:text-brand-300 transition-colors flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: p.color }} /> {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Supplement name (e.g. Zinc)" className="field" />
              <div className="grid grid-cols-3 gap-2">
                <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="field !px-2">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                <input value={form.defaultDose} onChange={(e) => setForm({ ...form, defaultDose: e.target.value })} placeholder="Dose" type="number" className="field !px-2.5" />
                <input value={form.dailyTarget} onChange={(e) => setForm({ ...form, dailyTarget: e.target.value })} placeholder="Target" type="number" className="field !px-2.5" />
              </div>
              <ColorPicker value={form.color} onPick={(c) => setForm({ ...form, color: c })} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => addSupp()} className="flex-1"><Check size={14} /> Add supplement</Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="py-6 flex justify-center"><div className="loader-ring !w-6 !h-6 !border-2" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No supplements yet. Tap <span className="text-brand-400">Add</span> to start tracking.</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((s) => {
            const color = s.color || '#34d399';
            const hit = s.dailyTarget ? s.totalToday >= s.dailyTarget : s.totalToday > 0;
            return (
              <motion.div key={s.id} layout className="rounded-xl border border-border bg-secondary/30 p-3" style={{ borderLeft: `3px solid ${color}` }}>
                {editId === s.id ? (
                  /* Edit supplement */
                  <div className="space-y-2.5">
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="field" />
                    <div className="grid grid-cols-3 gap-2">
                      <select value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} className="field !px-2">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                      <input value={editForm.defaultDose} onChange={(e) => setEditForm({ ...editForm, defaultDose: e.target.value })} placeholder="Dose" type="number" className="field !px-2.5" />
                      <input value={editForm.dailyTarget} onChange={(e) => setEditForm({ ...editForm, dailyTarget: e.target.value })} placeholder="Target" type="number" className="field !px-2.5" />
                    </div>
                    <ColorPicker value={editForm.color} onPick={(c) => setEditForm({ ...editForm, color: c })} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEdit} className="flex-1"><Check size={14} /> Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeSupp(s.id, s.name)} className="!text-destructive"><Trash2 size={14} /></Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground nums">
                            <span style={s.totalToday > 0 ? { color } : undefined} className={s.totalToday > 0 ? 'font-semibold' : ''}>{fmt(s.totalToday)}{s.unit}</span>
                            {s.dailyTarget ? <span className="text-muted-foreground"> / {fmt(s.dailyTarget)}{s.unit}</span> : ' today'}{hit && s.totalToday > 0 ? ' ✓' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {s.defaultDose ? (
                          <motion.button whileTap={{ scale: 0.92 }} whileHover={{ scale: 1.04 }} transition={spring.snappy}
                            onClick={() => log(s.id, s.defaultDose!)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-transform nums" style={{ background: color }}>
                            +{fmt(s.defaultDose)}{s.unit}
                          </motion.button>
                        ) : null}
                        <button onClick={() => setCustomFor(customFor === s.id ? null : s.id)} title="Custom dose" className="w-7 h-7 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"><Plus size={13} /></button>
                        <button onClick={() => openEdit(s)} title="Edit supplement" className="w-7 h-7 rounded-lg text-muted-foreground hover:text-brand-400 flex items-center justify-center transition-colors"><Pencil size={13} /></button>
                      </div>
                    </div>

                    {s.dailyTarget ? <div className="mt-2"><Progress value={s.totalToday} max={s.dailyTarget} color="volt" height="h-1.5" /></div> : null}

                    {/* Custom dose */}
                    <AnimatePresence>
                      {customFor === s.id && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="flex gap-2 mt-2.5">
                            <input autoFocus type="number" value={customAmt} onChange={(e) => setCustomAmt(e.target.value)} placeholder={`Amount (${s.unit})`} className="field flex-1" />
                            <Button size="sm" onClick={() => log(s.id, parseFloat(customAmt))} disabled={!customAmt}>Log</Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Today's intake — visible, editable, removable */}
                    {s.logs.length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-border/70 space-y-1">
                        <p className="text-[11px] text-muted-foreground">Today&apos;s intake</p>
                        {s.logs.map((l) => (
                          <div key={l.id} className="flex items-center justify-between text-xs">
                            {editLog?.id === l.id ? (
                              <div className="flex items-center gap-2 w-full">
                                <input autoFocus type="number" value={editLog.amount} onChange={(e) => setEditLog({ id: l.id, amount: e.target.value })} className="field !py-1 flex-1" />
                                <button onClick={saveLogEdit} className="text-success"><Check size={15} /></button>
                                <button onClick={() => setEditLog(null)} className="text-muted-foreground"><X size={15} /></button>
                              </div>
                            ) : (
                              <>
                                <span className="text-foreground nums">{fmt(l.amount)}{s.unit}</span>
                                <div className="flex items-center gap-2.5">
                                  <span className="text-muted-foreground nums">{new Date(l.loggedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
                                  <button onClick={() => setEditLog({ id: l.id, amount: String(l.amount) })} className="text-muted-foreground hover:text-brand-400 transition-colors"><Pencil size={12} /></button>
                                  <button onClick={() => delLog(l.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={12} /></button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

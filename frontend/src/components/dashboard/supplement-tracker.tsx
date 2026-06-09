'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pill, Plus, Trash2, X, Check, ChevronDown } from 'lucide-react';
import { supplementsApi } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

interface Supp {
  id: number;
  name: string;
  unit: string;
  defaultDose: number | null;
  dailyTarget: number | null;
  totalToday: number;
  logs: { id: number; amount: number; loggedAt: string }[];
}

const UNITS = ['mg', 'mcg', 'g', 'IU', 'ml', 'capsule', 'tablet', 'drop'];

export default function SupplementTracker({ onChange }: { onChange?: () => void }) {
  const [items, setItems] = useState<Supp[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', unit: 'mg', defaultDose: '', dailyTarget: '' });
  const [customFor, setCustomFor] = useState<number | null>(null);
  const [customAmt, setCustomAmt] = useState('');

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
  const delLog = async (logId: number) => { await supplementsApi.deleteLog(logId); after(); };
  const addSupp = async () => {
    if (!form.name.trim()) return;
    await supplementsApi.add({
      name: form.name.trim(),
      unit: form.unit,
      defaultDose: form.defaultDose ? parseFloat(form.defaultDose) : undefined,
      dailyTarget: form.dailyTarget ? parseFloat(form.dailyTarget) : undefined,
    });
    setForm({ name: '', unit: 'mg', defaultDose: '', dailyTarget: '' });
    setAdding(false);
    after();
  };
  const removeSupp = async (id: number, name: string) => {
    if (!confirm(`Remove "${name}" and its logs?`)) return;
    await supplementsApi.remove(id);
    after();
  };

  const fmt = (n: number) => (Number.isInteger(n) ? n : n.toFixed(1));

  return (
    <Card className="p-5">
      <CardHeader
        accent="brand"
        icon={<Pill size={18} />}
        title="Supplements"
        action={
          <button onClick={() => setAdding((v) => !v)} className="text-xs font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors">
            <Plus size={14} /> Add
          </button>
        }
      />

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mb-4 p-3 rounded-xl border border-border bg-secondary/40 space-y-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Supplement name (e.g. Zinc)" className="field" />
              <div className="grid grid-cols-3 gap-2">
                <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="field !px-2">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input value={form.defaultDose} onChange={(e) => setForm({ ...form, defaultDose: e.target.value })} placeholder="Dose" type="number" className="field !px-2.5" />
                <input value={form.dailyTarget} onChange={(e) => setForm({ ...form, dailyTarget: e.target.value })} placeholder="Target" type="number" className="field !px-2.5" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addSupp} className="flex-1"><Check size={14} /> Add supplement</Button>
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
            const hitTarget = s.dailyTarget ? s.totalToday >= s.dailyTarget : s.totalToday > 0;
            const isOpen = expanded === s.id;
            return (
              <motion.div key={s.id} layout className="rounded-xl border border-border bg-secondary/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground nums">
                      <span className={s.totalToday > 0 ? 'text-volt-400 font-semibold' : ''}>{fmt(s.totalToday)}{s.unit}</span>
                      {s.dailyTarget ? <span className="text-muted-foreground"> / {fmt(s.dailyTarget)}{s.unit}</span> : ' today'}
                      {hitTarget && s.totalToday > 0 && ' ✓'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {s.defaultDose ? (
                      <motion.button whileTap={{ scale: 0.92 }} whileHover={{ scale: 1.04 }} transition={spring.snappy}
                        onClick={() => log(s.id, s.defaultDose!)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-brand-500/15 text-brand-300 hover:bg-brand-500/25 transition-colors nums">
                        +{fmt(s.defaultDose)}{s.unit}
                      </motion.button>
                    ) : null}
                    <button onClick={() => setCustomFor(customFor === s.id ? null : s.id)} title="Custom dose"
                      className="w-7 h-7 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors">
                      <Plus size={13} />
                    </button>
                    {s.logs.length > 0 && (
                      <button onClick={() => setExpanded(isOpen ? null : s.id)} className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors">
                        <motion.span animate={{ rotate: isOpen ? 180 : 0 }}><ChevronDown size={14} /></motion.span>
                      </button>
                    )}
                    <button onClick={() => removeSupp(s.id, s.name)} title="Remove supplement" className="w-7 h-7 rounded-lg text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {s.dailyTarget ? <div className="mt-2"><Progress value={s.totalToday} max={s.dailyTarget} color="volt" height="h-1.5" /></div> : null}

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

                <AnimatePresence>
                  {isOpen && s.logs.length > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="mt-2.5 pt-2.5 border-t border-border space-y-1.5">
                        {s.logs.map((l) => (
                          <div key={l.id} className="flex items-center justify-between text-xs">
                            <span className="text-foreground nums">{fmt(l.amount)}{s.unit}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground nums">{new Date(l.loggedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
                              <button onClick={() => delLog(l.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

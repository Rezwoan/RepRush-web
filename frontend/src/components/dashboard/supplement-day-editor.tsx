'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Check, Pill, Clock } from 'lucide-react';
import { supplementsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtNum = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 10) / 10);
const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });

export default function SupplementDayEditor({ date, onClose, onChanged }: { date: string; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [editLog, setEditLog] = useState<{ id: number; amount: string } | null>(null);
  const isToday = date === new Date().toISOString().split('T')[0];

  const load = useCallback(() => {
    return supplementsApi.getByDate(date).then((r) => setItems(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => { await load(); onChanged(); };

  const logDose = async (id: number, amount: number) => {
    if (!amount || amount <= 0) return;
    await supplementsApi.logDose(id, amount, date);
    await refresh();
  };
  const addCustom = async (id: number) => {
    const v = parseFloat(custom[id]);
    if (!v) return;
    setCustom((c) => ({ ...c, [id]: '' }));
    await logDose(id, v);
  };
  const saveEdit = async () => {
    if (!editLog) return;
    const v = parseFloat(editLog.amount);
    if (v > 0) await supplementsApi.updateLog(editLog.id, v);
    setEditLog(null);
    await refresh();
  };
  const removeLog = async (logId: number) => { await supplementsApi.deleteLog(logId); await refresh(); };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <motion.div initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }}
          transition={spring.soft} onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-display font-bold flex items-center gap-2"><Pill size={18} className="text-brand-400" /> Supplements</h2>
              <p className="text-xs text-muted-foreground">{fmtDate(date)}{isToday ? ' · today' : ''}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X size={18} /></button>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center"><div className="loader-ring" /></div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No supplements set up yet.</p>
          ) : (
            <div className="space-y-3">
              {items.map((s) => {
                const color = s.color || '#34d399';
                return (
                  <div key={s.id} className="rounded-xl border border-border p-3" style={{ borderLeft: `3px solid ${color}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="font-medium text-sm truncate">{s.name}</span>
                      </div>
                      <span className="text-xs nums" style={{ color }}>{fmtNum(s.total)}{s.unit}</span>
                    </div>

                    <div className="flex gap-2">
                      {s.defaultDose > 0 && (
                        <button onClick={() => logDose(s.id, s.defaultDose)}
                          style={{ background: `${color}1f`, color }}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap">
                          +{fmtNum(s.defaultDose)}{s.unit}
                        </button>
                      )}
                      <input type="number" inputMode="decimal" value={custom[s.id] || ''} onChange={(e) => setCustom((c) => ({ ...c, [s.id]: e.target.value }))}
                        placeholder={`custom ${s.unit}`} className="field !py-1.5 text-sm flex-1 min-w-0" />
                      <Button size="sm" variant="secondary" onClick={() => addCustom(s.id)} disabled={!custom[s.id]}><Plus size={14} /></Button>
                    </div>

                    {s.logs.length > 0 && (
                      <div className="mt-2.5 space-y-1">
                        {s.logs.map((l: any) => (
                          <div key={l.id} className="flex items-center gap-2 text-sm">
                            {editLog?.id === l.id ? (
                              <>
                                <input type="number" autoFocus value={editLog?.amount ?? ''} onChange={(e) => setEditLog({ id: l.id, amount: e.target.value })}
                                  className="field !py-1 text-sm w-20" />
                                <button onClick={saveEdit} className="text-success p-1"><Check size={15} /></button>
                                <button onClick={() => setEditLog(null)} className="text-muted-foreground p-1"><X size={15} /></button>
                              </>
                            ) : (
                              <>
                                <span className="text-muted-foreground text-xs flex items-center gap-1 w-16"><Clock size={11} />{fmtTime(l.loggedAt)}</span>
                                <button onClick={() => setEditLog({ id: l.id, amount: String(l.amount) })} className="flex-1 text-left font-medium nums hover:text-brand-400 transition-colors">
                                  {fmtNum(l.amount)}{s.unit}
                                </button>
                                <button onClick={() => removeLog(l.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1"><Trash2 size={13} /></button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground text-center">Tap an entry to edit its amount. Logs are saved to {isToday ? 'today' : 'this date'}.</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

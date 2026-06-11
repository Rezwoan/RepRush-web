'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Zap, Check } from 'lucide-react';
import { creatineApi, usersApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { RingProgress } from '@/components/ui/progress';
import { spring } from '@/lib/motion';

interface Props {
  today: { totalGrams: number; logs: any[] };
  onLogged: () => void;
  onColorChange?: () => void;
  date?: string; // when set, log/show for this date instead of today
}

const QUICK_DOSES = [3, 5, 10, 15];
const DAILY_TARGET = 5;
const DEFAULT_COLOR = '#10b981';
const COLORS = ['#10b981', '#34d399', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c', '#faba0c', '#f87171', '#a3e635'];

export default function CreatineTracker({ today, onLogged, onColorChange, date }: Props) {
  const [customAmount, setCustomAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [showPalette, setShowPalette] = useState(false);

  useEffect(() => {
    usersApi.getProfile().then((r) => { if (r.data?.creatineColor) setColor(r.data.creatineColor); }).catch(() => {});
  }, []);

  const pickColor = async (c: string) => {
    setColor(c);
    setShowPalette(false);
    try { await usersApi.updateProfile({ creatineColor: c }); onColorChange?.(); } catch (e) { console.error(e); }
  };

  const logDose = async (amount: number, noteText?: string) => {
    if (!amount || amount <= 0) return;
    setLoading(true);
    try {
      await creatineApi.logDose(amount, noteText, date);
      onLogged();
      setCustomAmount('');
      setNote('');
      setShowCustom(false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const deleteDose = async (id: number) => {
    await creatineApi.deleteLog(id);
    onLogged();
  };

  const hit = today.totalGrams >= DAILY_TARGET;

  return (
    <Card className="p-5" interactive>
      {/* Header with colour control */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}1f`, color }}>
            <Zap size={18} />
          </span>
          <h3 className="font-display font-semibold">Creatine Tracker</h3>
        </div>
        <div className="relative">
          <button onClick={() => setShowPalette((v) => !v)} title="Change creatine colour"
            className="w-6 h-6 rounded-full border-2 border-border hover:scale-110 transition-transform" style={{ background: color }} />
          <AnimatePresence>
            {showPalette && (
              <motion.div initial={{ opacity: 0, scale: 0.9, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -4 }}
                className="absolute right-0 top-8 z-20 p-2 rounded-xl border border-border bg-popover shadow-xl grid grid-cols-5 gap-1.5 w-[168px]">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => pickColor(c)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: c }}>
                    {color === c && <Check size={13} className="text-black/70" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-5 mb-4">
        <RingProgress value={today.totalGrams} max={DAILY_TARGET} hex={color} size={84} stroke={8}>
          <div className="text-center">
            <div className="text-lg font-display font-bold nums leading-none">{today.totalGrams}<span className="text-xs text-muted-foreground">g</span></div>
          </div>
        </RingProgress>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            {hit ? 'Daily target hit 🔥' : `${(DAILY_TARGET - today.totalGrams).toFixed(1)}g to go`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{today.totalGrams}g of {DAILY_TARGET}g daily target</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {QUICK_DOSES.map((dose) => (
          <motion.button
            key={dose}
            onClick={() => logDose(dose)}
            disabled={loading}
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.05 }}
            transition={spring.snappy}
            style={{ background: `${color}14`, borderColor: `${color}40`, color }}
            className="px-3.5 py-1.5 border text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            +{dose}g
          </motion.button>
        ))}
        <motion.button
          onClick={() => setShowCustom(!showCustom)}
          whileTap={{ scale: 0.92 }}
          className="px-3.5 py-1.5 bg-secondary border border-dashed border-border text-muted-foreground hover:text-foreground text-sm rounded-lg transition-colors flex items-center gap-1"
        >
          <Plus size={14} /> Custom
        </motion.button>
      </div>

      <AnimatePresence>
        {showCustom && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 mb-3 pt-1">
              <input type="number" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="Amount (g)" className="field flex-1" min="0.5" step="0.5" />
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className="field flex-1" />
              <button onClick={() => logDose(parseFloat(customAmount), note)} disabled={loading || !customAmount}
                style={{ background: color }}
                className="px-4 rounded-xl text-sm font-semibold text-black/80 disabled:opacity-50 transition-opacity">Log</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {today.logs.length > 0 ? (
          <motion.div layout className="space-y-1.5 mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1">{date ? 'Doses' : "Today's doses"}</p>
            {today.logs.map((log) => (
              <motion.div
                key={log.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-foreground flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  {log.amountGrams}g{log.note && <span className="text-muted-foreground ml-1">({log.note})</span>}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground nums">
                    {new Date(log.loggedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <motion.button whileTap={{ scale: 0.85 }} onClick={() => deleteDose(log.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                    <Trash2 size={13} />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">No creatine logged today. Don&apos;t forget! 💊</p>
        )}
      </AnimatePresence>
    </Card>
  );
}

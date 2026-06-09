'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Zap } from 'lucide-react';
import { creatineApi } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui/card';
import { RingProgress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

interface Props {
  today: { totalGrams: number; logs: any[] };
  onLogged: () => void;
}

const QUICK_DOSES = [3, 5, 10, 15];
const DAILY_TARGET = 5;

export default function CreatineTracker({ today, onLogged }: Props) {
  const [customAmount, setCustomAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const logDose = async (amount: number, noteText?: string) => {
    if (!amount || amount <= 0) return;
    setLoading(true);
    try {
      await creatineApi.logDose(amount, noteText);
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
      <CardHeader accent="volt" icon={<Zap size={18} />} title="Creatine Tracker" />

      <div className="flex items-center gap-5 mb-4">
        <RingProgress value={today.totalGrams} max={DAILY_TARGET} color="volt" size={84} stroke={8}>
          <div className="text-center">
            <div className="text-lg font-display font-bold nums leading-none">{today.totalGrams}<span className="text-xs text-muted-foreground">g</span></div>
          </div>
        </RingProgress>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            {hit ? "Daily target hit 🔥" : `${(DAILY_TARGET - today.totalGrams).toFixed(1)}g to go`}
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
            className="px-3.5 py-1.5 bg-secondary hover:bg-volt-400/15 hover:text-volt-400 border border-border hover:border-volt-400/40 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
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
              <Button variant="volt" onClick={() => logDose(parseFloat(customAmount), note)} disabled={loading || !customAmount}>Log</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {today.logs.length > 0 ? (
          <motion.div layout className="space-y-1.5 mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1">Today&apos;s doses</p>
            {today.logs.map((log) => (
              <motion.div
                key={log.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-foreground">
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

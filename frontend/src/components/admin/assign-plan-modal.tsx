'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Loader2, Users } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { getInitials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

export default function AssignPlanModal({
  plan, users, onClose, onDone,
}: {
  plan: any;
  users: any[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const toggle = (id: number) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const allIds = users.map((u) => u.id);
  const allSelected = selected.length === users.length && users.length > 0;

  const assign = async (ids: number[]) => {
    if (!ids.length) return;
    setBusy(true);
    try {
      await adminApi.assignPlanToAll(plan.id, ids);
      setDone(`Assigned to ${ids.length} member${ids.length > 1 ? 's' : ''}`);
      onDone();
      setTimeout(onClose, 900);
    } catch (e) { console.error(e); setDone('Failed to assign'); }
    finally { setBusy(false); }
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <motion.div initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }}
          transition={spring.soft} onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-display font-bold">Assign “{plan.name}”</h2>
              <p className="text-xs text-muted-foreground">Choose members to assign this plan to.</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X size={18} /></button>
          </div>

          <button onClick={() => setSelected(allSelected ? [] : allIds)}
            className="text-xs font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1.5">
            <Users size={13} /> {allSelected ? 'Clear selection' : 'Select everyone'}
          </button>

          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {users.map((u) => {
              const sel = selected.includes(u.id);
              return (
                <button key={u.id} onClick={() => toggle(u.id)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-colors text-left ${sel ? 'border-brand-500/50 bg-brand-500/10' : 'border-border bg-secondary/30 hover:bg-secondary/60'}`}>
                  <span className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold overflow-hidden flex-shrink-0">
                    {u.profileImage ? <img src={u.profileImage} alt="" className="w-full h-full object-cover" /> : getInitials(u.name || u.email)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{u.name || u.email}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">{u.email}</span>
                  </span>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${sel ? 'border-brand-400 bg-brand-400 text-white' : 'border-border'}`}>
                    {sel && <Check size={12} />}
                  </span>
                </button>
              );
            })}
            {users.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No members to assign.</p>}
          </div>

          {done && <p className="text-sm text-success text-center">{done}</p>}

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => assign(allIds)} disabled={busy || !users.length}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />} All members
            </Button>
            <Button className="flex-1" onClick={() => assign(selected)} disabled={busy || !selected.length}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Assign ({selected.length})
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

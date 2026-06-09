'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Target, Lock, CheckCircle2 } from 'lucide-react';
import { achievementsApi } from '@/lib/api';
import { PageTransition, Stagger, Item } from '@/components/ui/motion-primitives';
import { Progress } from '@/components/ui/progress';

export default function AchievementsPage() {
  const [achievements, setAchievements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    achievementsApi.getAchievements().then((r) => setAchievements(r.data)).finally(() => setLoading(false));
  }, []);

  const unlocked = achievements.filter((a) => a.unlocked);
  const locked = achievements.filter((a) => !a.unlocked);

  return (
    <PageTransition className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Target size={24} className="text-brand-400" /> Goals
        </h1>
        <span className="text-sm text-muted-foreground bg-card border border-border px-3 py-1 rounded-full nums">
          {unlocked.length}/{achievements.length} unlocked
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="loader-ring" /></div>
      ) : (
        <>
          {unlocked.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-success uppercase tracking-wider mb-3">Unlocked</h2>
              <Stagger className="grid sm:grid-cols-2 gap-3">
                {unlocked.map((a) => <Item key={a.id}><AchievementCard achievement={a} /></Item>)}
              </Stagger>
            </div>
          )}

          {locked.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">In Progress</h2>
              <Stagger className="grid sm:grid-cols-2 gap-3">
                {locked.sort((a, b) => b.percent - a.percent).map((a) => <Item key={a.id}><AchievementCard achievement={a} /></Item>)}
              </Stagger>
            </div>
          )}

          {achievements.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Target size={40} className="mx-auto mb-3 opacity-30" />
              <p>Log your bodyweight and some lifts to unlock achievements!</p>
            </div>
          )}
        </>
      )}
    </PageTransition>
  );
}

function AchievementCard({ achievement: a }: { achievement: any }) {
  return (
    <motion.div whileHover={{ y: -3 }} className={`h-full rounded-2xl border p-4 ${a.unlocked ? 'border-success/40 bg-success/[0.06]' : 'border-border bg-card'}`}>
      <div className="flex items-center gap-2 mb-1">
        {a.unlocked
          ? <CheckCircle2 size={16} className="text-success flex-shrink-0" />
          : <Lock size={16} className="text-muted-foreground flex-shrink-0" />}
        <p className="font-semibold text-sm">{a.title}</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{a.description}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs nums">
          <span className="text-muted-foreground">{Math.round(a.current)}kg / {Math.round(a.target)}kg</span>
          <span className={a.unlocked ? 'text-success font-semibold' : 'text-brand-400'}>{a.percent}%</span>
        </div>
        <Progress value={a.percent} color={a.unlocked ? 'success' : 'brand'} height="h-2" />
      </div>
      {a.unlocked && <p className="text-xs text-success mt-2 font-medium">Achievement unlocked! 🎉</p>}
    </motion.div>
  );
}

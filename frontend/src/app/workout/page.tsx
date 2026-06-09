'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Dumbbell, Play, ChevronRight, CheckCircle2, Clock } from 'lucide-react';
import { workoutsApi, exercisesApi } from '@/lib/api';
import { PageTransition, Stagger, Item } from '@/components/ui/motion-primitives';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

export default function WorkoutPage() {
  const router = useRouter();
  const [myPlans, setMyPlans] = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      exercisesApi.getMyPlans().then((r) => setMyPlans(r.data)).catch(() => {}),
      workoutsApi.getSessions().then((r) => {
        const sessions = r.data;
        const active = sessions.find((s: any) => !s.completedAt);
        if (active) setActiveSession(active);
        setRecentSessions(sessions.filter((s: any) => s.completedAt).slice(0, 5));
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="loader-ring" /></div>;
  }

  return (
    <PageTransition className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-display font-extrabold tracking-tight">Workout</h1>

      {/* Active session */}
      {activeSession && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring.soft}
          className="relative overflow-hidden rounded-2xl border border-brand-500/30 bg-brand-500/[0.08] p-4 flex items-center justify-between"
        >
          <motion.span
            className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-volt-400 shadow-glow-volt"
            animate={{ opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <div>
            <p className="text-brand-400 font-semibold text-xs uppercase tracking-widest">Active Session</p>
            <p className="text-foreground font-semibold mt-0.5">{activeSession.workoutType || 'Workout'}</p>
            <p className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5">
              <Clock size={11} />
              Started {new Date(activeSession.startedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <Button onClick={() => router.push(`/workout/session/${activeSession.id}`)}>
            Continue <ChevronRight size={16} />
          </Button>
        </motion.div>
      )}

      {/* Plans */}
      {myPlans.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Your Program</p>
          <Stagger className="grid gap-3">
            {myPlans.map((up: any) => {
              const plan = up.plan;
              const exerciseCount = plan?.exercises?.exercises?.length || 0;
              const focus = plan?.exercises?.focus || '';
              return (
                <Item key={up.id}>
                  <Card interactive onClick={() => router.push(`/workout/preview/${up.planId}`)} className="p-4 group">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2.5 mb-1">
                          <span className="w-9 h-9 bg-brand-500/15 rounded-xl flex items-center justify-center">
                            <Dumbbell size={15} className="text-brand-400" />
                          </span>
                          <p className="font-semibold text-foreground group-hover:text-brand-400 transition-colors">{plan?.name}</p>
                        </div>
                        {focus && <p className="text-xs text-muted-foreground ml-[2.875rem]">{focus}</p>}
                        <p className="text-xs text-muted-foreground ml-[2.875rem] mt-0.5">{exerciseCount} exercises</p>
                      </div>
                      <motion.span className="text-muted-foreground group-hover:text-brand-400 transition-colors" whileHover={{ x: 3 }}>
                        <Play size={18} />
                      </motion.span>
                    </div>
                  </Card>
                </Item>
              );
            })}
          </Stagger>
        </div>
      )}

      {/* Recent */}
      {recentSessions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Recent Sessions</p>
          <Stagger className="space-y-2">
            {recentSessions.map((s: any) => (
              <Item key={s.id}>
                <Card className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.workoutType || 'Workout'}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.startedAt).toLocaleDateString('en-GB')} · {s.sets?.length || 0} sets
                    </p>
                  </div>
                  <CheckCircle2 size={16} className="text-success flex-shrink-0" />
                </Card>
              </Item>
            ))}
          </Stagger>
        </div>
      )}

      {/* Empty */}
      {myPlans.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Dumbbell size={28} className="text-brand-400" />
          </div>
          <p className="font-semibold mb-1">No workout plans yet</p>
          <p className="text-muted-foreground text-sm">Contact your admin to get a program assigned.</p>
        </motion.div>
      )}
    </PageTransition>
  );
}

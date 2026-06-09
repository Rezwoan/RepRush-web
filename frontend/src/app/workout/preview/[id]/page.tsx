'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Dumbbell, ChevronLeft, Play, Clock, Target, RotateCcw } from 'lucide-react';
import { exercisesApi, workoutsApi, usersApi } from '@/lib/api';
import { PageTransition, Stagger, Item } from '@/components/ui/motion-primitives';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { spring } from '@/lib/motion';

interface Exercise {
  name: string;
  sets: number;
  reps: string;
  bwMultiplier: number;
  rest: number;
  notes?: string;
}

export default function WorkoutPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const planId = parseInt(id);

  const [plan, setPlan] = useState<any>(null);
  const [userWeight, setUserWeight] = useState<number>(75);
  const [starting, setStarting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      exercisesApi.getPlan(planId).then((r) => setPlan(r.data)),
      usersApi.getProfile().then((r) => { if (r.data.weightKg) setUserWeight(r.data.weightKg); }),
    ]).finally(() => setLoading(false));
  }, [planId]);

  const startSession = async () => {
    setStarting(true);
    try {
      const res = await workoutsApi.startSession(plan.name, planId);
      router.push(`/workout/session/${res.data.id}`);
    } catch (e) { console.error(e); setStarting(false); }
  };

  const getStartWeight = (ex: Exercise): string => {
    if (!ex.bwMultiplier || ex.bwMultiplier === 0) return 'Bodyweight';
    const rounded = Math.round((userWeight * ex.bwMultiplier) / 2.5) * 2.5;
    return `${rounded} kg`;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="loader-ring" /></div>;
  if (!plan) return <div className="text-center py-20 text-muted-foreground">Plan not found.</div>;

  const exercises: Exercise[] = plan.exercises?.exercises || [];
  const focus = plan.exercises?.focus || '';

  return (
    <PageTransition className="max-w-lg mx-auto pb-32 lg:pb-8">
      <div className="flex items-center gap-3 mb-6">
        <motion.button onClick={() => router.back()} whileTap={{ scale: 0.9 }} whileHover={{ x: -2 }}
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <ChevronLeft size={20} />
        </motion.button>
        <div>
          <h1 className="text-xl font-display font-bold">{plan.name}</h1>
          {focus && <p className="text-sm text-muted-foreground">{focus}</p>}
        </div>
      </div>

      <Item standalone className="mb-5">
        <div className="flex items-start gap-3 rounded-2xl border border-brand-500/20 bg-brand-500/[0.07] p-3.5">
          <span className="w-9 h-9 bg-brand-500/15 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
            <Target size={15} className="text-brand-400" />
          </span>
          <div>
            <p className="text-sm text-brand-200 font-medium">Weights scaled to your bodyweight</p>
            <p className="text-xs text-brand-400/70">Based on {userWeight} kg — update it in your profile for sharper targets</p>
          </div>
        </div>
      </Item>

      <Stagger className="space-y-3 mb-6">
        {exercises.map((ex, i) => (
          <Item key={i}>
            <Card className="p-4" interactive>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 bg-brand-gradient rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold text-white">{i + 1}</span>
                <p className="font-semibold text-sm">{ex.name}</p>
              </div>
              <div className="flex flex-wrap gap-2 ml-9">
                <span className="text-xs bg-secondary text-foreground px-2.5 py-1 rounded-lg font-medium nums">{ex.sets} sets × {ex.reps} reps</span>
                <span className="text-xs bg-volt-400/15 text-volt-400 px-2.5 py-1 rounded-lg font-medium nums">{getStartWeight(ex)}</span>
                {ex.rest && <span className="text-xs text-muted-foreground flex items-center gap-1 nums"><Clock size={10} />{ex.rest}s rest</span>}
              </div>
              {ex.notes && <p className="text-xs text-muted-foreground/70 mt-2 ml-9 italic">{ex.notes}</p>}
            </Card>
          </Item>
        ))}
      </Stagger>

      <div className="fixed bottom-0 left-0 right-0 p-4 glass border-t border-border lg:relative lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none z-40">
        <div className="max-w-lg mx-auto flex gap-3">
          <Button variant="secondary" size="lg" onClick={() => router.back()} className="px-3.5"><RotateCcw size={18} /></Button>
          <Button size="lg" onClick={startSession} disabled={starting} className="flex-1">
            <Play size={18} />{starting ? 'Starting…' : `Start ${plan.name}`}
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}

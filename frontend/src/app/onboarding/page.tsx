'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Camera, ChevronRight, SkipForward } from 'lucide-react';
import { usersApi, workoutsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { spring } from '@/lib/motion';

type Step = 'photo' | 'measurements' | 'prs' | 'done';

const stepAnim = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0, transition: spring.soft },
  exit: { opacity: 0, x: -30, transition: { duration: 0.2 } },
};

export default function OnboardingPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>('photo');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bench, setBench] = useState({ weight: '', reps: '', season: '' });
  const [squat, setSquat] = useState({ weight: '', reps: '', season: '' });
  const [deadlift, setDeadlift] = useState({ weight: '', reps: '', season: '' });

  const steps: Step[] = ['photo', 'measurements', 'prs', 'done'];
  const stepIndex = steps.indexOf(step);
  const progress = Math.round((stepIndex / (steps.length - 1)) * 100);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const savePhoto = async () => {
    if (!imagePreview) { setStep('measurements'); return; }
    setSaving(true);
    try { await usersApi.uploadImage(imagePreview); await refresh(); setStep('measurements'); }
    finally { setSaving(false); }
  };

  const saveMeasurements = async () => {
    if (!height && !weight) { setStep('prs'); return; }
    setSaving(true);
    try {
      await usersApi.updateProfile({ heightCm: height ? parseFloat(height) : undefined, weightKg: weight ? parseFloat(weight) : undefined });
      setStep('prs');
    } finally { setSaving(false); }
  };

  const savePRs = async () => {
    setSaving(true);
    try {
      const prList = [
        { type: 'bench', data: bench }, { type: 'squat', data: squat }, { type: 'deadlift', data: deadlift },
      ].filter((p) => p.data.weight && p.data.reps);
      await Promise.all(prList.map((p) => workoutsApi.createPR({
        exerciseType: p.type, weightKg: parseFloat(p.data.weight), reps: parseInt(p.data.reps),
        season: p.data.season || String(new Date().getFullYear()),
      })));
      setStep('done');
    } finally { setSaving(false); }
  };

  const LIFT_STANDARDS = {
    bench: { beginner: '0.5× BW', advanced: '1.5× BW' },
    squat: { beginner: '0.75× BW', advanced: '2× BW' },
    deadlift: { beginner: '1× BW', advanced: '2.5× BW' },
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-brand-500/15 blur-[110px]" />

      <div className="relative w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <Logo size="sm" withText={false} />
          <div>
            <p className="font-display font-bold text-lg">Rep<span className="text-gradient">Rush</span></p>
            <p className="text-muted-foreground text-xs">Let&apos;s set up your profile</p>
          </div>
        </div>

        {step !== 'done' && (
          <div className="mb-6">
            <div className="flex justify-between text-xs text-muted-foreground mb-2 nums">
              <span>Step {stepIndex + 1} of {steps.length - 1}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} color="brand" height="h-1.5" glow />
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 'photo' && (
            <motion.div key="photo" {...stepAnim} className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-display font-bold">Add a profile photo</h2>
              <p className="text-sm text-muted-foreground">So your crew can recognize you on the leaderboard.</p>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => fileRef.current?.click()}
                className="w-full aspect-square max-w-[160px] mx-auto rounded-2xl bg-secondary border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-brand-500/50 transition-colors overflow-hidden">
                {imagePreview ? <img src={imagePreview} alt="preview" className="w-full h-full object-cover" /> : (
                  <div className="text-center text-muted-foreground"><Camera size={32} className="mx-auto mb-2" /><p className="text-xs">Tap to upload</p></div>
                )}
              </motion.div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              <div className="flex gap-2">
                <Button onClick={savePhoto} disabled={saving} className="flex-1">{saving ? 'Saving…' : imagePreview ? 'Save & Continue' : 'Continue'}</Button>
                <Button variant="ghost" onClick={() => setStep('measurements')}><SkipForward size={14} /> Skip</Button>
              </div>
            </motion.div>
          )}

          {step === 'measurements' && (
            <motion.div key="measurements" {...stepAnim} className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-display font-bold">Your measurements</h2>
              <p className="text-sm text-muted-foreground">Used for strength standards and the leaderboard.</p>
              <div className="space-y-3">
                <div><label className="text-xs text-muted-foreground block mb-1.5">Height (cm)</label>
                  <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="175" className="field" /></div>
                <div><label className="text-xs text-muted-foreground block mb-1.5">Weight (kg)</label>
                  <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="75" step="0.5" className="field" /></div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveMeasurements} disabled={saving} className="flex-1">{saving ? 'Saving…' : 'Continue'}</Button>
                <Button variant="ghost" onClick={() => setStep('prs')}><SkipForward size={14} /> Skip</Button>
              </div>
            </motion.div>
          )}

          {step === 'prs' && (
            <motion.div key="prs" {...stepAnim} className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-display font-bold">Your PRs &amp; Last Season</h2>
              <p className="text-sm text-muted-foreground">Enter your best lifts and when you hit them. Used to calibrate your baseline.</p>
              {[
                { label: 'Bench Press', state: bench, setState: setBench, type: 'bench' },
                { label: 'Squat', state: squat, setState: setSquat, type: 'squat' },
                { label: 'Deadlift', state: deadlift, setState: setDeadlift, type: 'deadlift' },
              ].map(({ label, state, setState, type }) => (
                <div key={type}>
                  <label className="text-sm font-medium mb-2 block">{label}</label>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" value={state.weight} onChange={(e) => setState({ ...state, weight: e.target.value })} placeholder="Weight" className="field !px-2.5" />
                    <input type="number" value={state.reps} onChange={(e) => setState({ ...state, reps: e.target.value })} placeholder="Reps" className="field !px-2.5" />
                    <input type="text" value={state.season} onChange={(e) => setState({ ...state, season: e.target.value })} placeholder="Season" className="field !px-2.5" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Beginner: {LIFT_STANDARDS[type as keyof typeof LIFT_STANDARDS].beginner} · Advanced: {LIFT_STANDARDS[type as keyof typeof LIFT_STANDARDS].advanced}
                  </p>
                </div>
              ))}
              <div className="flex gap-2">
                <Button onClick={savePRs} disabled={saving} className="flex-1">{saving ? 'Saving…' : 'Save & Finish'}</Button>
                <Button variant="ghost" onClick={() => setStep('done')}><SkipForward size={14} /> Skip</Button>
              </div>
            </motion.div>
          )}

          {step === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1, transition: spring.bouncy }}
              className="glass rounded-2xl p-6 text-center space-y-4 border-success/30">
              <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.bouncy, delay: 0.1 }}>
                <CheckCircle2 size={48} className="text-success mx-auto" />
              </motion.div>
              <h2 className="text-xl font-display font-bold">You&apos;re all set! 🎉</h2>
              <p className="text-muted-foreground text-sm">Your profile is ready. Time to crush it.</p>
              <Button size="lg" className="w-full" onClick={() => router.replace('/dashboard')}>Go to Dashboard <ChevronRight size={16} /></Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

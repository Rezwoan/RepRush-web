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
import { ImageCropper } from '@/components/ui/image-cropper';
import { spring } from '@/lib/motion';

type Step = 'photo' | 'measurements' | 'prs' | 'done';
type Lift = { weight: string; when: string; customNum: string; customUnit: string };

const stepAnim = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0, transition: spring.soft },
  exit: { opacity: 0, x: -30, transition: { duration: 0.2 } },
};

const WHENS = [
  { k: '1w', label: '1 week ago' },
  { k: '1mo', label: '1 month ago' },
  { k: '3mo', label: '3 months ago' },
  { k: 'custom', label: 'Custom' },
];

function whenToDate(when: string, customNum: string, customUnit: string): string | undefined {
  const d = new Date();
  if (when === '1w') d.setDate(d.getDate() - 7);
  else if (when === '1mo') d.setMonth(d.getMonth() - 1);
  else if (when === '3mo') d.setMonth(d.getMonth() - 3);
  else if (when === 'custom') {
    const n = parseInt(customNum);
    if (!n || n <= 0) return undefined;
    if (customUnit === 'years') d.setFullYear(d.getFullYear() - n);
    else d.setMonth(d.getMonth() - n);
  }
  return d.toISOString().split('T')[0];
}

export default function OnboardingPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>('photo');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bench, setBench] = useState<Lift>({ weight: '', when: '1mo', customNum: '', customUnit: 'years' });
  const [squat, setSquat] = useState<Lift>({ weight: '', when: '1mo', customNum: '', customUnit: 'years' });
  const [deadlift, setDeadlift] = useState<Lift>({ weight: '', when: '1mo', customNum: '', customUnit: 'years' });

  const steps: Step[] = ['photo', 'measurements', 'prs', 'done'];
  const stepIndex = steps.indexOf(step);
  const progress = Math.round((stepIndex / (steps.length - 1)) * 100);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Optimistic: advance instantly, persist in the background (these stay on-page).
  const savePhoto = () => {
    if (imagePreview) usersApi.uploadImage(imagePreview).then(() => refresh()).catch(console.error);
    setStep('measurements');
  };
  const saveMeasurements = () => {
    if (height || weight) {
      usersApi.updateProfile({
        heightCm: height ? parseFloat(height) : undefined,
        weightKg: weight ? parseFloat(weight) : undefined,
      }).catch(console.error);
    }
    setStep('prs');
  };

  // Final step → awaits because we navigate away right after.
  const savePRs = async () => {
    setSaving(true);
    try {
      const list = [
        { type: 'bench', ...bench }, { type: 'squat', ...squat }, { type: 'deadlift', ...deadlift },
      ].filter((p) => p.weight);
      await Promise.all(list.map((p) => workoutsApi.createPR({
        exerciseType: p.type,
        weightKg: parseFloat(p.weight),
        reps: 1,
        date: whenToDate(p.when, p.customNum, p.customUnit),
      })));
      setStep('done');
    } finally { setSaving(false); }
  };

  const lifts: { label: string; state: Lift; setState: (l: Lift) => void; type: string }[] = [
    { label: 'Bench Press', state: bench, setState: setBench, type: 'bench' },
    { label: 'Squat', state: squat, setState: setSquat, type: 'squat' },
    { label: 'Deadlift', state: deadlift, setState: setDeadlift, type: 'deadlift' },
  ];

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
                <Button onClick={savePhoto} className="flex-1">{imagePreview ? 'Save & Continue' : 'Continue'}</Button>
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
                <Button onClick={saveMeasurements} className="flex-1">Continue</Button>
                <Button variant="ghost" onClick={() => setStep('prs')}><SkipForward size={14} /> Skip</Button>
              </div>
            </motion.div>
          )}

          {step === 'prs' && (
            <motion.div key="prs" {...stepAnim} className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-display font-bold">Your personal bests</h2>
              <p className="text-sm text-muted-foreground">Your heaviest single rep (1RM) for each lift, and roughly when you hit it. Used to calibrate your baseline.</p>
              {lifts.map(({ label, state, setState, type }) => (
                <div key={type} className="rounded-xl border border-border bg-card/40 p-3.5">
                  <label className="text-sm font-medium mb-2 block">{label}</label>
                  <div className="relative mb-3">
                    <input type="number" value={state.weight} onChange={(e) => setState({ ...state, weight: e.target.value })} placeholder="Heaviest single rep" step="0.5" className="field pr-10" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">kg</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1.5">When did you hit it?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WHENS.map((w) => {
                      const active = state.when === w.k;
                      return (
                        <button key={w.k} type="button" onClick={() => setState({ ...state, when: w.k })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${active ? 'bg-brand-500/15 border-brand-500/40 text-brand-300' : 'bg-secondary border-border text-muted-foreground hover:text-foreground'}`}>
                          {w.label}
                        </button>
                      );
                    })}
                  </div>
                  {state.when === 'custom' && (
                    <div className="flex gap-2 mt-2">
                      <input type="number" min={1} value={state.customNum} onChange={(e) => setState({ ...state, customNum: e.target.value })} placeholder="e.g. 2" className="field w-24" />
                      <select value={state.customUnit} onChange={(e) => setState({ ...state, customUnit: e.target.value })} className="field flex-1">
                        <option value="months">months ago</option>
                        <option value="years">years ago</option>
                      </select>
                    </div>
                  )}
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

      <ImageCropper src={cropSrc} onCancel={() => setCropSrc(null)} onConfirm={(dataUrl) => { setImagePreview(dataUrl); setCropSrc(null); }} />
    </div>
  );
}

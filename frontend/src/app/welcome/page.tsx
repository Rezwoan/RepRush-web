'use client';
/**
 * The onboarding funnel — SPEC §3, all 28 screens, one route.
 *
 * It lives at `/welcome` rather than `/onboarding` because v1's `/onboarding`
 * is a different thing that still ships: a post-login profile-completion
 * prompt linked from the dashboard banner. This funnel runs *before* an account
 * exists, so the two can't share a route.
 *
 * Every answer is held client-side (and in localStorage, so a reload resumes)
 * until step 26 posts the whole payload to `/auth/register`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, Eye, EyeOff, Share2 } from 'lucide-react';
import { authApi, ranksApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { setToken } from '@/lib/token';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { TIER_LABEL, TIER_VAR, ROMAN, type Tier, type Division } from '@/lib/ranks';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { OptionCard, Segmented, Chip } from '@/components/ui/controls';
import { RulerPicker, WheelPicker } from '@/components/ui/pickers';
import { Bar } from '@/components/ui/display';
import { Rays, Confetti, CoachMark } from '@/components/ui/celebration';
import { BrandLoader } from '@/components/ui/motion-primitives';
import { Mascot, MascotSays } from '@/components/art/mascot';
import { RankBadge } from '@/components/art/rank-badge';
import { Medal } from '@/components/art/medal';
import { BodygraphPair } from '@/components/art/bodygraph';
import { EquipmentIcon } from '@/components/art/equipment-icon';
import { GLYPHS, GLYPH_BOX } from '@/components/art/game-icons';
import { TABS, TabBar } from '@/components/layout/tab-bar';
import {
  ALL_EQUIPMENT,
  AVATARS,
  Answers,
  CAROUSEL,
  DEFAULT_ANSWERS,
  EQUIPMENT_GROUPS,
  EQUIPMENT_LABEL,
  EQUIPMENT_PRESET,
  FIRST_RANK_EXERCISES,
  QUESTION_STEPS,
  STEPS,
  Step,
  birthDateFromAge,
  clearProgress,
  cmToIn,
  feetInches,
  inToCm,
  kgToLb,
  lbToKg,
  loadProgress,
  saveProgress,
} from './config';

const haptic = (ms: number | number[] = 12) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
};

const screenAnim = {
  initial: { opacity: 0, x: 28 },
  animate: { opacity: 1, x: 0, transition: spring.soft },
  exit: { opacity: 0, x: -28, transition: { duration: 0.18 } },
};

/** Wraps a hand-written screen: title, optional mascot bubble, then content. */
function Screen({
  title,
  bubble,
  note,
  pose,
  children,
  className,
}: {
  title?: React.ReactNode;
  bubble?: React.ReactNode;
  note?: React.ReactNode;
  pose?: Parameters<typeof Mascot>[0]['pose'];
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex w-full flex-col gap-5', className)}>
      {bubble && <MascotSays pose={pose ?? 'idle'}>{bubble}</MascotSays>}
      {title && <h1 className="text-[28px] font-extrabold leading-tight">{title}</h1>}
      {note && <p className="-mt-2 text-sm text-muted-foreground">{note}</p>}
      {children}
    </div>
  );
}

// ── Screens that are more than a list of options ─────────────────────

function Splash({ onStart }: { onStart: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 px-6 text-center">
      <Logo size="lg" />
      <div>
        <h1 className="text-4xl font-extrabold leading-tight">Train. Track. Rush.</h1>
        <p className="mt-3 max-w-xs text-muted-foreground">
          Every set you log gets ranked. Find out how strong you actually are.
        </p>
      </div>
      <div className="flex items-end justify-center gap-1">
        {(['idle', 'flex', 'cheer'] as const).map((p, i) => (
          <motion.div
            key={p}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.soft, delay: 0.1 + i * 0.08 }}
          >
            <Mascot pose={p} size={i === 1 ? 116 : 88} />
          </motion.div>
        ))}
      </div>
      <div className="w-full max-w-sm space-y-3">
        <Button variant="chunky" size="cta" onClick={onStart}>
          Get started
        </Button>
        <Button variant="chunkyOutline" size="cta" onClick={() => router.push('/login')}>
          I already have an account
        </Button>
      </div>
    </div>
  );
}

function CarouselArt({ art }: { art: (typeof CAROUSEL)[number]['art'] }) {
  if (art === 'ladder')
    return (
      <div className="flex items-end justify-center gap-1">
        {(['bronze', 'silver', 'gold', 'platinum', 'diamond', 'titan', 'legend'] as Tier[]).map((t, i) => (
          <motion.div
            key={t}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.soft, delay: i * 0.06 }}
            style={{ marginBottom: i * 6 }}
          >
            <RankBadge tier={t} size="sm" animated={false} showDivision={false} />
          </motion.div>
        ))}
      </div>
    );
  if (art === 'body') return <BodygraphPair className="mx-auto h-56" />;
  if (art === 'plan')
    return (
      <div className="mx-auto w-full max-w-xs rounded-2xl border border-border bg-card p-4 text-left">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Today</p>
        <p className="mt-1 text-lg font-extrabold">Push · Chest &amp; Triceps</p>
        {[
          ['Mid Chest', 0.42],
          ['Triceps', 0.31],
          ['Front Delt', 0.27],
        ].map(([label, v]) => (
          <div key={label as string} className="mt-3">
            <div className="mb-1 flex justify-between text-xs font-semibold">
              <span>{label}</span>
              <span className="text-muted-foreground">{Math.round((v as number) * 100)}%</span>
            </div>
            <Bar value={v as number} />
          </div>
        ))}
      </div>
    );
  return (
    <div className="mx-auto flex w-full max-w-xs items-center gap-3">
      <div className="flex-1 rounded-2xl border border-border bg-card p-4 text-center">
        <p className="nums text-3xl font-extrabold">1,840</p>
        <p className="text-xs text-muted-foreground">kcal left</p>
      </div>
      <div className="flex-1 rounded-2xl border border-border bg-card p-4 text-center">
        <p className="nums text-3xl font-extrabold">4 × 8</p>
        <p className="text-xs text-muted-foreground">Bench · 80 kg</p>
      </div>
    </div>
  );
}

function Carousel({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const slide = CAROUSEL[i];
  const last = i === CAROUSEL.length - 1;
  return (
    <div className="flex min-h-[100dvh] flex-col px-6 pb-8 pt-14">
      <button
        onClick={onDone}
        className="self-end text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        Skip
      </button>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <AnimatePresence mode="wait">
          <motion.div key={slide.art} {...screenAnim} className="w-full">
            <div className="mb-8 grid min-h-[224px] place-items-center">
              <CarouselArt art={slide.art} />
            </div>
            <h2 className="text-[26px] font-extrabold">{slide.title}</h2>
            <p className="mx-auto mt-2 max-w-xs text-muted-foreground">{slide.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mb-6 flex justify-center gap-2">
        {CAROUSEL.map((_, n) => (
          <span
            key={n}
            className={cn(
              'h-2 rounded-full transition-all',
              n === i ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30',
            )}
          />
        ))}
      </div>
      <Button variant="chunky" size="cta" onClick={() => (last ? onDone() : setI(i + 1))}>
        {last ? "Let's go" : 'Next'}
      </Button>
    </div>
  );
}

function NameStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Screen bubble="First things first — what should I call you?" title="Your name">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 40))}
        placeholder="e.g. Alex"
        className="w-full rounded-2xl border-2 border-border bg-card px-4 py-4 text-xl font-bold outline-none transition-colors focus:border-primary"
      />
    </Screen>
  );
}

/** Press-and-hold to commit (SPEC step 5). The hold is the point — no tap shortcut. */
const HOLD_MS = 1400;

function CommitStep({ done, onDone }: { done: boolean; onDone: () => void }) {
  const [progress, setProgress] = useState(done ? 1 : 0);
  const raf = useRef(0);
  const start = useRef(0);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setProgress((p) => (p >= 1 ? 1 : 0));
  }, []);

  const tick = useCallback(() => {
    const p = Math.min(1, (performance.now() - start.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      haptic([40, 30, 60]);
      onDone();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }, [onDone]);

  const begin = useCallback(() => {
    if (progress >= 1) return;
    haptic(10);
    start.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }, [progress, tick]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <Screen
      bubble="Ready? Press and hold me until the ring fills."
      pose="flex"
      title="Make it official"
      note="This is the bit people skip. Don't."
    >
      <div className="grid place-items-center py-4">
        <button
          onPointerDown={begin}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
          aria-label="Press and hold to commit"
          className="relative grid h-52 w-52 place-items-center rounded-full focus-ring"
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="46" fill="none" stroke="hsl(var(--secondary))" strokeWidth="5" />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 46}
              strokeDashoffset={2 * Math.PI * 46 * (1 - progress)}
            />
          </svg>
          <motion.div animate={{ scale: 1 + progress * 0.12 }} transition={{ duration: 0.1 }}>
            <Mascot pose={progress >= 1 ? 'cheer' : 'flex'} size={132} />
          </motion.div>
        </button>
      </div>
      <p className="text-center text-sm font-semibold text-muted-foreground">
        {progress >= 1 ? "That's a promise. Let's go." : 'Hold to commit'}
      </p>
    </Screen>
  );
}

function HeightStep({ a, set }: { a: Answers; set: (p: Partial<Answers>) => void }) {
  const imperial = a.heightUnit === 'ft';
  return (
    <Screen bubble="How tall are you?" title="Height">
      <Segmented
        className="mx-auto w-40"
        size="sm"
        value={a.heightUnit}
        onChange={(heightUnit) => set({ heightUnit })}
        options={[
          { value: 'cm', label: 'cm' },
          { value: 'ft', label: 'ft / in' },
        ]}
      />
      <div className="flex items-center justify-center gap-6 py-2">
        {imperial ? (
          <RulerPicker
            orientation="vertical"
            label="Height in inches"
            unit="in"
            min={48}
            max={90}
            step={1}
            major={6}
            value={Math.round(cmToIn(a.heightCm))}
            onChange={(v) => set({ heightCm: +inToCm(v).toFixed(1) })}
          />
        ) : (
          <RulerPicker
            orientation="vertical"
            label="Height in centimetres"
            unit="cm"
            min={120}
            max={230}
            step={1}
            major={10}
            value={Math.round(a.heightCm)}
            onChange={(heightCm) => set({ heightCm })}
          />
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        {imperial ? `${Math.round(a.heightCm)} cm` : feetInches(cmToIn(a.heightCm))}
      </p>
    </Screen>
  );
}

function WeightStep({ a, set }: { a: Answers; set: (p: Partial<Answers>) => void }) {
  const imperial = a.weightUnit === 'lb';
  return (
    <Screen bubble="And your bodyweight?" title="Weight">
      <p className="-mt-2 text-sm text-muted-foreground">
        Ranks are strength <em>relative to bodyweight</em>, so this one actually matters. You can
        change it any time.
      </p>
      <Segmented
        className="mx-auto w-40"
        size="sm"
        value={a.weightUnit}
        onChange={(weightUnit) => set({ weightUnit })}
        options={[
          { value: 'kg', label: 'kg' },
          { value: 'lb', label: 'lb' },
        ]}
      />
      <div className="py-2">
        {imperial ? (
          <RulerPicker
            label="Bodyweight in pounds"
            unit="lb"
            min={66}
            max={440}
            step={1}
            major={10}
            value={Math.round(kgToLb(a.weightKg))}
            onChange={(v) => set({ weightKg: +lbToKg(v).toFixed(1) })}
          />
        ) : (
          <RulerPicker
            label="Bodyweight in kilograms"
            unit="kg"
            min={30}
            max={200}
            step={0.5}
            major={10}
            value={a.weightKg}
            onChange={(weightKg) => set({ weightKg })}
          />
        )}
      </div>
    </Screen>
  );
}

const AGES = Array.from({ length: 78 }, (_, i) => i + 13);

function AgeStep({ a, set }: { a: Answers; set: (p: Partial<Answers>) => void }) {
  return (
    <Screen bubble="How old are you? Standards shift with age — you get credit for it." title="Age">
      <div className="py-4">
        <WheelPicker label="Age" options={AGES} value={a.age} onChange={(age) => set({ age })} />
      </div>
    </Screen>
  );
}

function Interstitial({
  eyebrow,
  title,
  body,
  wash,
  art,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  body: React.ReactNode;
  wash: string;
  art: React.ReactNode;
}) {
  return (
    <div className="relative -mx-6 -mt-4 flex min-h-[60vh] flex-col items-center justify-center gap-6 overflow-hidden rounded-3xl px-8 py-12 text-center">
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: wash }} />
      {art}
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">{eyebrow}</p>
      )}
      <h1 className="text-[30px] font-extrabold leading-tight text-white">{title}</h1>
      <p className="max-w-xs text-white/80">{body}</p>
    </div>
  );
}

/** A game-icons glyph on its own, for the narrative screens. */
function Glyph({ id, size = 96, color }: { id: keyof typeof GLYPHS; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`} aria-hidden>
      <path d={GLYPHS[id].d} fill={color ?? 'currentColor'} />
    </svg>
  );
}

function AvatarStep({ value, onPick, onDone }: { value: string; onPick: (v: string) => void; onDone: () => void }) {
  const [phase, setPhase] = useState<'intro' | 'grid' | 'reveal'>(value ? 'reveal' : 'intro');
  const chosen = AVATARS.find((x) => x.id === value) ?? AVATARS[0];

  if (phase === 'intro')
    return (
      <Screen bubble="Time to pick a face. This is you from here on." pose="cheer" title="Choose your avatar">
        <div className="grid place-items-center py-6">
          <Mascot pose="idle" size={150} float />
        </div>
        <Button variant="chunky" size="cta" onClick={() => setPhase('grid')}>
          Show me
        </Button>
      </Screen>
    );

  if (phase === 'grid')
    return (
      <Screen title="Choose your avatar">
        <div className="grid grid-cols-3 gap-3">
          {AVATARS.map((av) => (
            <button
              key={av.id}
              onClick={() => {
                haptic();
                onPick(av.id);
                setPhase('reveal');
              }}
              className={cn(
                'press flex flex-col items-center gap-1 rounded-2xl border-2 p-3 transition-colors',
                value === av.id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-muted-foreground/40',
              )}
            >
              <Mascot pose={av.id} size={64} />
              <span className="text-xs font-semibold">{av.label}</span>
            </button>
          ))}
        </div>
      </Screen>
    );

  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="relative grid h-64 w-64 place-items-center">
        <Rays color="hsl(var(--primary))" />
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.bouncy}
        >
          <Mascot pose={chosen.id} size={168} />
        </motion.div>
      </div>
      <h1 className="text-[28px] font-extrabold">Looking good.</h1>
      <p className="text-muted-foreground">You can change this any time from your profile.</p>
      <div className="flex w-full max-w-sm gap-3">
        <Button variant="chunkyOutline" size="cta" onClick={() => setPhase('grid')}>
          Change
        </Button>
        <Button variant="chunky" size="cta" onClick={onDone}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

function EquipmentStep({ a, set }: { a: Answers; set: (p: Partial<Answers>) => void }) {
  const selected = new Set(a.equipment);
  const toggle = (id: string) => {
    haptic();
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    set({ equipment: ALL_EQUIPMENT.filter((e) => next.has(e)) });
  };
  const all = selected.size === ALL_EQUIPMENT.length;

  return (
    <Screen
      title="What can you get to?"
      bubble="Sessions only use what you actually have."
    >
      <div className="flex items-center justify-between">
        <span className="nums text-sm font-bold text-muted-foreground">
          {selected.size}/{ALL_EQUIPMENT.length} selected
        </span>
        <Chip onClick={() => set({ equipment: all ? [] : [...ALL_EQUIPMENT] })}>
          {all ? 'Clear all' : 'Select all'}
        </Chip>
      </div>
      {EQUIPMENT_GROUPS.map((g) => (
        <div key={g.label} className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{g.label}</p>
          {g.items.map((e) => (
            <OptionCard
              key={e}
              multi
              selected={selected.has(e)}
              onClick={() => toggle(e)}
              icon={<EquipmentIcon equipment={e} size={26} />}
              label={EQUIPMENT_LABEL[e]}
            />
          ))}
        </div>
      ))}
    </Screen>
  );
}

const REPS = Array.from({ length: 20 }, (_, i) => i + 1);

function FirstRankStep({
  a,
  set,
  onDone,
}: {
  a: Answers;
  set: (p: Partial<Answers>) => void;
  onDone: () => void;
}) {
  const [pick, setPick] = useState(FIRST_RANK_EXERCISES[0]);
  const [weight, setWeight] = useState(a.weightUnit === 'lb' ? 135 : 60);
  const [reps, setReps] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const imperial = a.weightUnit === 'lb';

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const weightKg = imperial ? +lbToKg(weight).toFixed(1) : weight;
      const res = await ranksApi.calculate({
        exerciseId: pick.id,
        weightKg,
        reps,
        bodyweightKg: a.weightKg,
        sex: a.sex || undefined,
        age: a.age,
      });
      const { rank } = res.data;
      set({
        firstRank: {
          exerciseId: pick.id,
          name: pick.label,
          weightKg,
          reps,
          tier: rank.tier,
          division: rank.division,
          lp: rank.lp,
          percentile: rank.percentile,
        },
      });
      haptic([30, 40, 30]);
      onDone();
    } catch {
      setError("Couldn't reach the ranking engine. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bubble="Pick a lift you know your numbers for. I'll rank it right now." pose="flex" title="Your first rank">
      <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
        {FIRST_RANK_EXERCISES.map((e) => (
          <button
            key={e.id}
            onClick={() => setPick(e)}
            className={cn(
              'press flex w-28 shrink-0 flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-colors',
              pick.id === e.id ? 'border-primary bg-primary/10' : 'border-border bg-card',
            )}
          >
            <EquipmentIcon equipment={e.equipment} size={30} />
            <span className="text-center text-xs font-bold leading-tight">{e.label}</span>
          </button>
        ))}
      </div>

      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {pick.bodyweight ? 'Added weight' : 'Weight'}
        </p>
        <RulerPicker
          label="Weight lifted"
          unit={imperial ? 'lb' : 'kg'}
          min={0}
          max={imperial ? 700 : 320}
          step={imperial ? 5 : 2.5}
          major={4}
          value={weight}
          onChange={setWeight}
        />
        {pick.bodyweight && (
          <p className="text-center text-xs text-muted-foreground">
            Leave at 0 for plain bodyweight reps.
          </p>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">Reps</p>
        <WheelPicker label="Reps" options={REPS} value={reps} onChange={setReps} itemHeight={44} />
      </div>

      {error && <p className="text-center text-sm font-semibold text-destructive">{error}</p>}
      <Button variant="chunkyGold" size="cta" disabled={busy} onClick={submit}>
        {busy ? 'Ranking…' : 'Get my rank'}
      </Button>
    </Screen>
  );
}

function RankReveal({ a, onDone }: { a: Answers; onDone: () => void }) {
  const r = a.firstRank;
  const tier = (r?.tier ?? 'unranked') as Tier;
  const share = async () => {
    const text = `I just ranked ${TIER_LABEL[tier]} ${ROMAN[(r?.division ?? 3) as Division]} on ${r?.name} in RepRush.`;
    try {
      if (navigator.share) await navigator.share({ text, title: 'RepRush' });
      else await navigator.clipboard.writeText(text);
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 text-center">
      <Confetti />
      <div className="relative grid h-72 w-72 place-items-center">
        <Rays color={TIER_VAR[tier]} />
        <RankBadge tier={tier} division={(r?.division ?? 3) as Division} size="xl" entrance />
      </div>
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{r?.name}</p>
        <h1 className="mt-1 text-4xl font-extrabold" style={{ color: TIER_VAR[tier] }}>
          {TIER_LABEL[tier]} {ROMAN[(r?.division ?? 3) as Division]}
        </h1>
        <p className="mt-3 text-muted-foreground">
          Stronger than <span className="nums font-bold text-foreground">{Math.round(r?.percentile ?? 0)}%</span>{' '}
          of lifters your size.
        </p>
      </div>
      <div className="flex w-full max-w-sm gap-3">
        <Button variant="chunkyOutline" size="icon" className="h-14 w-14 shrink-0" onClick={share} aria-label="Share">
          <Share2 size={20} />
        </Button>
        <Button variant="chunky" size="cta" onClick={onDone}>
          Onwards &amp; upwards
        </Button>
      </div>
    </div>
  );
}

const BUILD_STAGES = ['Compiling profile', 'Calculating strength levels', 'Generating Bodyrank'];

function BuildingStep({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (stage >= BUILD_STAGES.length) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStage((s) => s + 1), 900);
    return () => clearTimeout(t);
  }, [stage, onDone]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8 px-2 text-center">
      <Mascot pose="idle" size={130} float />
      <h1 className="text-[26px] font-extrabold">Building your profile</h1>
      <div className="w-full max-w-sm space-y-5">
        {BUILD_STAGES.map((label, i) => (
          <div key={label}>
            <div className="mb-1.5 flex items-center justify-between text-sm font-semibold">
              <span className={i <= stage ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
              {i < stage && <Check size={16} className="text-success" strokeWidth={3} />}
            </div>
            <Bar value={i < stage ? 1 : i === stage ? 0.6 : 0} />
          </div>
        ))}
      </div>
    </div>
  );
}

const BODYRANK_MARKS = [
  'This is your Bodygraph. Every muscle carries its own rank, and together they make your Bodyrank.',
  'It fills in as you train. Muscles you have never worked stay grey — and they hold your Bodyrank down.',
  'So the app always knows what to point you at next: the lowest-ranked muscle that is recovered.',
];

function BodyrankStep({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setRect(ref.current?.getBoundingClientRect() ?? null);
  }, [i]);

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <h1 className="text-[26px] font-extrabold">Meet your Bodyrank</h1>
      <div ref={ref} className="rounded-2xl border border-border bg-card p-3">
        <BodygraphPair className="h-64" />
      </div>
      <CoachMark
        open
        step={i + 1}
        total={BODYRANK_MARKS.length}
        text={BODYRANK_MARKS[i]}
        target={rect}
        actionLabel="Got it"
        onNext={() => (i + 1 < BODYRANK_MARKS.length ? setI(i + 1) : onDone())}
      />
    </div>
  );
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function StreakStep({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <div className="relative grid h-56 w-56 place-items-center">
        <Rays color="hsl(var(--accent))" />
        <Mascot pose="fire" size={160} float />
      </div>
      <div>
        <p className="nums text-6xl font-extrabold text-accent">0</p>
        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          workout streak
        </p>
      </div>
      <div className="flex gap-2">
        {WEEKDAYS.map((d, i) => (
          <span
            key={i}
            className="grid h-9 w-9 place-items-center rounded-full border-2 border-dashed border-border text-xs font-bold text-muted-foreground"
          >
            {d}
          </span>
        ))}
      </div>
      <p className="max-w-xs text-muted-foreground">
        Train on a day, the day lights up. Miss one and it resets — that is the whole game.
      </p>
      <Button variant="chunkyGold" size="cta" className="max-w-sm" onClick={onDone}>
        Challenge accepted
      </Button>
    </div>
  );
}

function SignupStep({ a, onDone }: { a: Answers; onDone: () => void }) {
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && password.length >= 8;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await authApi.register({
        email: email.trim(),
        password,
        name: a.name.trim() || 'Athlete',
        sex: a.sex || undefined,
        birthDate: birthDateFromAge(a.age),
        heightCm: a.heightCm,
        weightKg: a.weightKg,
        avatarId: a.avatarId || undefined,
        experience: a.experience || undefined,
        goal: a.goal || undefined,
        trainingLocation: a.trainingLocation || undefined,
        equipment: a.equipment,
        limitations: a.limitations.filter((l) => l !== 'none'),
      });
      if (res.data?.token) setToken(res.data.token);
      await refresh();
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <Screen
      bubble={`Almost there${a.name ? `, ${a.name}` : ''}. Save it so it's yours.`}
      pose="cheer"
      title="A stronger you is closer than you think."
    >
      <input
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="w-full rounded-2xl border-2 border-border bg-card px-4 py-4 font-semibold outline-none transition-colors focus:border-primary"
      />
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (8+ characters)"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="w-full rounded-2xl border-2 border-border bg-card px-4 py-4 pr-12 font-semibold outline-none transition-colors focus:border-primary"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      <Button variant="chunky" size="cta" disabled={!valid || busy} onClick={submit}>
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Everything you just answered is saved to this account.
      </p>
    </Screen>
  );
}

function MedalStep({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex min-h-[75vh] flex-col items-center justify-center gap-6 text-center">
      <Confetti />
      <div className="relative grid h-64 w-64 place-items-center">
        <Rays />
        <motion.div
          initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ ...spring.bouncy, delay: 0.1 }}
        >
          <Medal emblem="bolt" material="bronze" size={150} />
        </motion.div>
      </div>
      <h1 className="text-[28px] font-extrabold">You&apos;ve earned your first medal!</h1>
      <p className="max-w-xs text-muted-foreground">
        <span className="font-bold text-foreground">First Steps</span> — you finished setup. There are
        a lot more where that came from.
      </p>
      <Button variant="chunkyGold" size="cta" className="max-w-sm" onClick={onDone}>
        Collect
      </Button>
    </div>
  );
}

function HelloStep({ name, avatarId, onDone }: { name: string; avatarId: string; onDone: () => void }) {
  return (
    <div className="flex min-h-[75vh] flex-col items-center justify-center gap-6 text-center">
      <Mascot pose={(avatarId as any) || 'cheer'} size={170} float />
      <h1 className="text-4xl font-extrabold">Welcome, {name || 'athlete'}.</h1>
      <p className="max-w-xs text-muted-foreground">
        Your profile is built, your first rank is on the board. Time to train.
      </p>
      <Button variant="chunky" size="cta" className="max-w-sm" onClick={onDone}>
        Let&apos;s go
      </Button>
    </div>
  );
}

const TOUR_COPY: Record<string, string> = {
  '/workout': 'Workout — build a session or resume one. Everything you log gets ranked.',
  '/home': 'Home — today’s session, what’s recovered, and your last 14 workouts.',
  '/ranks': 'Ranks — your Bodyrank, the Bodygraph, and every badge in the game.',
  '/nutrition': 'Nutrition — calories and macros, with your workouts folded in.',
  '/friends': 'Friends — feeds, reactions and leaderboards.',
  '/profile': 'Profile — cosmetics, stats, medals and every setting.',
};

/**
 * The post-signup tab tour. It runs here, over a real `<TabBar/>`, rather than
 * on the destination page: the tabs it describes are P5–P10 screens that don't
 * exist yet, and a tour that survives a route change would need global state
 * for a thing that happens exactly once.
 */
function TourStep({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const el = document.querySelectorAll<HTMLElement>('nav[aria-label="Primary"] a')[i];
    setRect(el?.getBoundingClientRect() ?? null);
  }, [i]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 pb-24 text-center">
      <Mascot pose="idle" size={110} />
      <h1 className="text-2xl font-extrabold">Six tabs, that&apos;s it.</h1>
      <TabBar />
      <CoachMark
        open
        step={i + 1}
        total={TABS.length}
        text={TOUR_COPY[TABS[i].href]}
        target={rect}
        actionLabel="Start training"
        onNext={() => (i + 1 < TABS.length ? setI(i + 1) : onDone())}
      />
    </div>
  );
}

// ── The machine ─────────────────────────────────────────────────────

export default function WelcomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState(0);
  const [a, setA] = useState<Answers>(DEFAULT_ANSWERS);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Resume where the funnel was left. Read in an effect, not during render, so
  // the server and the first client pass agree.
  useEffect(() => {
    const saved = loadProgress();
    if (saved) {
      setIdx(saved.step);
      setA(saved.answers);
    }
    setReady(true);
  }, []);

  // An already-signed-in visitor has no business in the funnel.
  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  useEffect(() => {
    if (ready) saveProgress(idx, a);
  }, [ready, idx, a]);

  const set = useCallback((patch: Partial<Answers>) => setA((prev) => ({ ...prev, ...patch })), []);

  const step: Step = STEPS[idx];
  const go = useCallback(
    (delta: number) => {
      setIdx((i) => Math.max(0, Math.min(STEPS.length - 1, i + delta)));
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [],
  );
  const next = useCallback(() => go(1), [go]);
  const back = useCallback(() => go(-1), [go]);

  const finish = useCallback(() => {
    clearProgress();
    router.replace('/dashboard');
  }, [router]);

  const qIndex = QUESTION_STEPS.indexOf(step.id);
  const progress = qIndex < 0 ? 0 : ((qIndex + 1) / QUESTION_STEPS.length) * 100;

  // `commit` has no answer field of its own — the hold either happened or it didn't.
  const [committed, setCommitted] = useState(false);

  /** Is the current step's answer good enough to move on? */
  const answered = useMemo(() => {
    if (step.kind === 'choice') return !!a[step.field];
    if (step.kind === 'multi') return a[step.field].length > 0;
    switch (step.id) {
      case 'name':
        return a.name.trim().length > 0;
      case 'commit':
        return committed;
      case 'equipment':
        return a.equipment.length > 0;
      default:
        return true;
    }
  }, [step, a, committed]);

  if (!ready || loading || user) return <BrandLoader />;

  // Full-bleed screens own their whole viewport and skip the funnel chrome.
  if (step.id === 'splash') return <Splash onStart={next} />;
  if (step.id === 'carousel') return <Carousel onDone={next} />;

  const body = (() => {
    switch (step.kind) {
      case 'choice':
        return (
          <Screen title={step.title} bubble={step.bubble} note={step.note}>
            <div className="space-y-3">
              {step.options.map((o) => (
                <OptionCard
                  key={o.value}
                  label={o.label}
                  sublabel={o.sub}
                  selected={a[step.field] === o.value}
                  onClick={() => {
                    haptic();
                    set({ [step.field]: o.value } as Partial<Answers>);
                    // Presetting equipment from the location answer is the whole
                    // point of asking where you train (SPEC step 19 → 20).
                    if (step.field === 'trainingLocation')
                      set({ equipment: [...(EQUIPMENT_PRESET[o.value] ?? [])] });
                    if (step.auto) setTimeout(next, 180);
                  }}
                />
              ))}
            </div>
          </Screen>
        );

      case 'multi':
        return (
          <Screen title={step.title} bubble={step.bubble}>
            <div className="space-y-3">
              {step.options.map((o) => {
                const chosen = a[step.field].includes(o.value);
                return (
                  <OptionCard
                    key={o.value}
                    multi
                    label={o.label}
                    selected={chosen}
                    onClick={() => {
                      haptic();
                      const current = a[step.field];
                      let nextVal: string[];
                      if (o.value === step.exclusive) nextVal = chosen ? [] : [o.value];
                      else {
                        const without = current.filter((v) => v !== o.value && v !== step.exclusive);
                        nextVal = chosen ? without : [...without, o.value];
                      }
                      set({ [step.field]: nextVal } as Partial<Answers>);
                    }}
                  />
                );
              })}
            </div>
          </Screen>
        );

      default:
        switch (step.id) {
          case 'intro':
            return (
              <Screen>
                <div className="grid place-items-center py-6">
                  <Mascot pose="cheer" size={150} float />
                </div>
                <h1 className="text-center text-[28px] font-extrabold leading-tight">
                  Hey — I&apos;m Volt.
                </h1>
                <p className="text-center text-muted-foreground">
                  I just have a few questions. They take about two minutes and they decide everything
                  the app does for you after this.
                </p>
              </Screen>
            );
          case 'name':
            return <NameStep value={a.name} onChange={(name) => set({ name })} />;
          case 'commit':
            return <CommitStep done={committed} onDone={() => setCommitted(true)} />;
          case 'height':
            return <HeightStep a={a} set={set} />;
          case 'weight':
            return <WeightStep a={a} set={set} />;
          case 'age':
            return <AgeStep a={a} set={set} />;
          case 'about-you':
            return (
              <Interstitial
                wash="linear-gradient(160deg, hsl(var(--primary)) 0%, hsl(var(--tier-diamond)) 100%)"
                art={<Mascot pose="idle" size={140} float />}
                eyebrow="Just so we're clear"
                title="This journey is all about you."
                body="No leaderboards you didn't ask for, no generic plan. Everything from here is built on what you just told me."
              />
            );
          case 'avatar':
            return <AvatarStep value={a.avatarId} onPick={(avatarId) => set({ avatarId })} onDone={next} />;
          case 'systems':
            return (
              <Interstitial
                wash="linear-gradient(160deg, #8E1B1B 0%, #E33B3B 100%)"
                art={<Glyph id="flame" color="rgba(255,255,255,.9)" size={104} />}
                eyebrow="The hard truth"
                title="Motivation doesn't last. Systems do."
                body="Everyone starts. The people who keep going have something measuring them. That's what a rank is for."
              />
            );
          case 'path':
            return (
              <Interstitial
                wash="linear-gradient(160deg, #123E6B 0%, hsl(var(--primary)) 100%)"
                art={
                  <div className="flex items-end gap-3">
                    <Glyph id="mountain" color="rgba(255,255,255,.9)" size={96} />
                    <RankBadge tier="legend" size="md" animated={false} showDivision={false} />
                  </div>
                }
                eyebrow="The path"
                title="Bronze to Legend, one set at a time."
                body="Nobody starts at the top. But every logged set moves a real number, and the number never lies to you."
              />
            );
          case 'equipment':
            return <EquipmentStep a={a} set={set} />;
          case 'first-rank':
            return <FirstRankStep a={a} set={set} onDone={next} />;
          case 'rank-reveal':
            return <RankReveal a={a} onDone={next} />;
          case 'building':
            return <BuildingStep onDone={next} />;
          case 'bodyrank':
            return <BodyrankStep onDone={next} />;
          case 'streak':
            return <StreakStep onDone={next} />;
          case 'signup':
            return <SignupStep a={a} onDone={next} />;
          case 'medal':
            return <MedalStep onDone={next} />;
          case 'hello':
            return <HelloStep name={a.name} avatarId={a.avatarId} onDone={next} />;
          case 'tour':
            return <TourStep onDone={finish} />;
          default:
            return null;
        }
    }
  })();

  // Screens that own their own CTA don't get the funnel's NEXT button.
  const SELF_DRIVEN = new Set([
    'avatar',
    'first-rank',
    'rank-reveal',
    'building',
    'bodyrank',
    'streak',
    'signup',
    'medal',
    'hello',
    'tour',
  ]);
  const showNext = !SELF_DRIVEN.has(step.id) && !(step.kind === 'choice' && step.auto);
  const canProceed = answered;
  // Past signup there is no going back — the account exists.
  const showBack = qIndex >= 0 || ['rank-reveal'].includes(step.id);

  return (
    <div ref={scrollRef} className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-6 pb-8 pt-4">
      {qIndex >= 0 && (
        <div className="mb-6 flex items-center gap-3 pt-2">
          <button
            onClick={back}
            disabled={!showBack}
            aria-label="Back"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${progress}%` }}
              transition={spring.soft}
            />
          </div>
          {step.kind === 'choice' && step.skip ? (
            <button
              onClick={next}
              className="shrink-0 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
          ) : (
            <span className="w-9 shrink-0" />
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div key={step.id} {...screenAnim}>
            {body}
          </motion.div>
        </AnimatePresence>
      </div>

      {showNext && (
        <div className="sticky bottom-0 -mx-6 mt-6 bg-gradient-to-t from-background via-background to-transparent px-6 pb-2 pt-4">
          <Button variant="chunky" size="cta" disabled={!canProceed} onClick={next}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

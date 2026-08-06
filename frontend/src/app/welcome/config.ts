/**
 * The onboarding funnel's data layer — every question that is *just* a list of
 * options lives here as data, so `page.tsx` only hand-writes the screens that
 * genuinely need custom UI (pickers, the first-rank flow, signup, celebrations).
 *
 * The step order is SPEC §3.3 verbatim.
 */
import type { Equipment } from '@/components/art/equipment-icon';
import type { MascotPose } from '@/components/art/mascot';

// ── Answers ─────────────────────────────────────────────────────────

export interface FirstRank {
  exerciseId: string;
  name: string;
  weightKg: number;
  reps: number;
  tier: string;
  division: number;
  lp: number;
  percentile: number;
}

export interface Answers {
  name: string;
  experience: string;
  goal: string;
  sex: string;
  heightCm: number;
  weightKg: number;
  age: number;
  avatarId: string;
  mindshare: string;
  limitations: string[];
  energy: string;
  relate1: string;
  relate2: string;
  hasPlan: string;
  trainingLocation: string;
  equipment: string[];
  firstRank: FirstRank | null;
  heightUnit: 'cm' | 'ft';
  weightUnit: 'kg' | 'lb';
}

export const DEFAULT_ANSWERS: Answers = {
  name: '',
  experience: '',
  goal: '',
  sex: '',
  heightCm: 175,
  weightKg: 75,
  age: 25,
  avatarId: '',
  mindshare: '',
  limitations: [],
  energy: '',
  relate1: '',
  relate2: '',
  hasPlan: '',
  trainingLocation: '',
  equipment: [],
  firstRank: null,
  heightUnit: 'cm',
  weightUnit: 'kg',
};

type ChoiceField = 'experience' | 'goal' | 'sex' | 'mindshare' | 'energy' | 'relate1' | 'relate2' | 'hasPlan' | 'trainingLocation';
type MultiField = 'limitations';

export interface Opt {
  value: string;
  label: string;
  sub?: string;
}

export type Step =
  /** Hand-written screen; `page.tsx` switches on the id. */
  | { id: string; kind: 'custom'; q?: boolean }
  | {
      id: string;
      kind: 'choice';
      q: true;
      field: ChoiceField;
      title: string;
      bubble?: string;
      note?: string;
      skip?: boolean;
      /** Advance as soon as an option is tapped — right for short, obvious lists. */
      auto?: boolean;
      options: Opt[];
    }
  | {
      id: string;
      kind: 'multi';
      q: true;
      field: MultiField;
      title: string;
      bubble?: string;
      /** Selecting this clears everything else (and vice versa). */
      exclusive?: string;
      options: Opt[];
    };

// ── The funnel ──────────────────────────────────────────────────────

export const STEPS: Step[] = [
  { id: 'splash', kind: 'custom' },
  { id: 'carousel', kind: 'custom' },

  { id: 'intro', kind: 'custom', q: true },
  { id: 'name', kind: 'custom', q: true },
  {
    id: 'experience',
    kind: 'choice',
    q: true,
    field: 'experience',
    title: 'How much have you trained?',
    bubble: "No wrong answer — it just sets your starting point.",
    auto: true,
    options: [
      { value: 'never', label: 'Never trained', sub: 'Complete beginner' },
      { value: 'beginner', label: 'Beginner', sub: 'Less than a year' },
      { value: 'intermediate', label: 'Intermediate', sub: '1–3 years' },
      { value: 'advanced', label: 'Advanced', sub: '3+ years' },
    ],
  },
  {
    id: 'goal',
    kind: 'choice',
    q: true,
    field: 'goal',
    title: "What are you here for?",
    auto: true,
    options: [
      { value: 'muscle', label: 'Build muscle' },
      { value: 'strength', label: 'Get stronger' },
      { value: 'fat_loss', label: 'Lose fat' },
      { value: 'health', label: 'Stay healthy' },
      { value: 'athletic', label: 'Athletic performance' },
    ],
  },
  { id: 'commit', kind: 'custom', q: true },
  {
    id: 'sex',
    kind: 'choice',
    q: true,
    field: 'sex',
    title: 'Sex',
    note: 'Strength standards differ by sex. This is used to rank you fairly — nothing else.',
    auto: true,
    options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ],
  },
  { id: 'height', kind: 'custom', q: true },
  { id: 'weight', kind: 'custom', q: true },
  { id: 'age', kind: 'custom', q: true },
  { id: 'about-you', kind: 'custom', q: true },
  { id: 'avatar', kind: 'custom', q: true },
  {
    id: 'mindshare',
    kind: 'choice',
    q: true,
    field: 'mindshare',
    title: 'How often do you think about getting in shape?',
    auto: true,
    options: [
      { value: 'constantly', label: 'Constantly' },
      { value: 'often', label: 'Most days' },
      { value: 'sometimes', label: 'Now and then' },
      { value: 'rarely', label: 'Rarely — I just want to start' },
    ],
  },
  {
    id: 'limitations',
    kind: 'multi',
    q: true,
    field: 'limitations',
    title: 'Anything we should work around?',
    bubble: "I'll keep these out of your sessions.",
    exclusive: 'none',
    options: [
      { value: 'back', label: 'Sensitive back' },
      { value: 'knees', label: 'Sensitive knees' },
      { value: 'shoulders', label: 'Sensitive shoulders' },
      { value: 'wrists', label: 'Sensitive wrists' },
      { value: 'none', label: 'None of these' },
    ],
  },
  {
    id: 'energy',
    kind: 'choice',
    q: true,
    field: 'energy',
    title: 'How are your energy levels?',
    auto: true,
    options: [
      { value: 'empty', label: 'Running on empty', sub: 'Tired most of the day' },
      { value: 'low', label: 'Low', sub: 'Fine in the morning, gone by evening' },
      { value: 'ok', label: 'Steady', sub: 'Enough to get through the day' },
      { value: 'high', label: 'Full charge', sub: 'Plenty to spare' },
    ],
  },
  {
    id: 'relate1',
    kind: 'choice',
    q: true,
    field: 'relate1',
    title: '"I start strong, then stop after a few weeks."',
    skip: true,
    auto: true,
    options: [
      { value: 'yes', label: "Yes, that's me" },
      { value: 'no', label: 'Not really' },
    ],
  },
  {
    id: 'relate2',
    kind: 'choice',
    q: true,
    field: 'relate2',
    title: '"I never know if I\'m actually getting stronger."',
    skip: true,
    auto: true,
    options: [
      { value: 'yes', label: "Yes, that's me" },
      { value: 'no', label: 'Not really' },
    ],
  },
  { id: 'systems', kind: 'custom', q: true },
  { id: 'path', kind: 'custom', q: true },
  {
    id: 'hasPlan',
    kind: 'choice',
    q: true,
    field: 'hasPlan',
    title: 'Do you already follow a plan?',
    auto: true,
    options: [
      { value: 'yes', label: 'Yes, I have a routine' },
      { value: 'no', label: 'No — build me one' },
    ],
  },
  {
    id: 'location',
    kind: 'choice',
    q: true,
    field: 'trainingLocation',
    title: 'Where do you train?',
    bubble: "This presets your equipment — you can fix it on the next screen.",
    auto: true,
    options: [
      { value: 'big_gym', label: 'Big gym', sub: 'Full commercial setup' },
      { value: 'small_gym', label: 'Small gym', sub: 'Basics and a few machines' },
      { value: 'home', label: 'Home', sub: 'Whatever I own' },
      { value: 'outdoors', label: 'Outdoors', sub: 'Park, calisthenics' },
      { value: 'travelling', label: 'Travelling', sub: 'Hotel rooms, whatever I find' },
    ],
  },
  { id: 'equipment', kind: 'custom', q: true },
  { id: 'first-rank', kind: 'custom', q: true },

  { id: 'rank-reveal', kind: 'custom' },
  { id: 'building', kind: 'custom' },
  { id: 'bodyrank', kind: 'custom' },
  { id: 'streak', kind: 'custom' },
  { id: 'signup', kind: 'custom' },
  { id: 'medal', kind: 'custom' },
  { id: 'hello', kind: 'custom' },
  { id: 'tour', kind: 'custom' },
];

/** Index of each step, so the machine can jump by id. */
export const STEP_INDEX: Record<string, number> = Object.fromEntries(
  STEPS.map((s, i) => [s.id, i]),
);

/** Only the question funnel drives the progress bar; splash and payoff don't. */
export const QUESTION_STEPS = STEPS.filter((s) => s.q).map((s) => s.id);

// ── Value carousel (SPEC §3.2) ──────────────────────────────────────

export const CAROUSEL = [
  { art: 'ladder', title: 'Climb the ranks', body: 'Every set you log is scored against real strength standards. Bronze to Legend — earn it.' },
  { art: 'body', title: 'See your whole body', body: 'Each muscle gets its own rank. The weak ones are impossible to ignore.' },
  { art: 'plan', title: 'A plan built for you', body: 'Sessions aimed at what is recovered and what is lagging. Not a generic template.' },
  { art: 'all', title: 'Everything in one place', body: 'Workouts, nutrition, friends and progress — one app, no spreadsheets.' },
] as const;

// ── Avatars ─────────────────────────────────────────────────────────
// The mascot's six poses double as the avatar set: they are already drawn,
// already ours, and already tinted by the active theme.
// ponytail: six avatars is the whole set. Cosmetic avatar unlocks are P10's
// store; this only has to give a new account a face.
export const AVATARS: { id: MascotPose; label: string }[] = [
  { id: 'idle', label: 'Steady' },
  { id: 'flex', label: 'Flexed' },
  { id: 'cheer', label: 'Hyped' },
  { id: 'fire', label: 'On fire' },
  { id: 'sleep', label: 'Rest day' },
  { id: 'sad', label: 'Humbled' },
];

// ── Equipment ───────────────────────────────────────────────────────
// SPEC's source app shows "n/97 selected" over a 97-item hardware list. Our
// catalog only distinguishes eight equipment types, and the generator can only
// filter on those eight — so the picker is over what actually changes the
// output, not over a longer list that would collapse to the same filter.

export const EQUIPMENT_GROUPS: { label: string; items: Equipment[] }[] = [
  { label: 'Bars & plates', items: ['barbell', 'plate'] },
  { label: 'Small weights', items: ['dumbbell', 'kettlebell'] },
  { label: 'Machines & cables', items: ['machine', 'cable'] },
  { label: 'Accessories', items: ['band', 'bodyweight'] },
];

export const ALL_EQUIPMENT: Equipment[] = EQUIPMENT_GROUPS.flatMap((g) => g.items);

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  plate: 'Weight plates',
  dumbbell: 'Dumbbells',
  kettlebell: 'Kettlebells',
  machine: 'Machines',
  cable: 'Cables',
  band: 'Resistance bands',
  bodyweight: 'Bodyweight only',
};

/** What each training location starts you with (step 19 → step 20). */
export const EQUIPMENT_PRESET: Record<string, Equipment[]> = {
  big_gym: ALL_EQUIPMENT,
  small_gym: ['barbell', 'plate', 'dumbbell', 'machine', 'bodyweight'],
  home: ['dumbbell', 'kettlebell', 'band', 'bodyweight'],
  outdoors: ['band', 'bodyweight'],
  travelling: ['band', 'bodyweight'],
};

// ── First rank carousel (step 21) ───────────────────────────────────
// Catalog ids from `backend/data/exercises.json`. Deliberately the lifts people
// already know their numbers for — this screen is asked before an account
// exists, so it has to be answerable from memory.
export const FIRST_RANK_EXERCISES = [
  { id: 'Barbell_Bench_Press_-_Medium_Grip', label: 'Bench Press', equipment: 'barbell' as Equipment, bodyweight: false },
  { id: 'Barbell_Squat', label: 'Squat', equipment: 'barbell' as Equipment, bodyweight: false },
  { id: 'Barbell_Deadlift', label: 'Deadlift', equipment: 'barbell' as Equipment, bodyweight: false },
  { id: 'Barbell_Shoulder_Press', label: 'Overhead Press', equipment: 'barbell' as Equipment, bodyweight: false },
  { id: 'Wide-Grip_Lat_Pulldown', label: 'Lat Pulldown', equipment: 'cable' as Equipment, bodyweight: false },
  { id: 'Barbell_Curl', label: 'Barbell Curl', equipment: 'barbell' as Equipment, bodyweight: false },
  { id: 'Leg_Press', label: 'Leg Press', equipment: 'machine' as Equipment, bodyweight: false },
  { id: 'Pullups', label: 'Pull-Ups', equipment: 'bodyweight' as Equipment, bodyweight: true },
];

// ── Unit helpers ────────────────────────────────────────────────────

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inches: number) => inches * CM_PER_IN;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

/** 70 in → `5′ 10″`. */
export function feetInches(totalInches: number): string {
  const whole = Math.round(totalInches);
  return `${Math.floor(whole / 12)}′ ${whole % 12}″`;
}

/**
 * Age → an ISO date the backend can store; day precision we don't have.
 * Local calendar parts, not UTC: east of Greenwich a UTC date is yesterday for
 * most of the local morning, and the stored birthday would be a day off.
 */
export function birthDateFromAge(age: number, now = new Date()): string {
  const y = now.getFullYear() - age;
  return `${y}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ── Persistence ─────────────────────────────────────────────────────
// The whole funnel is client-side until signup, so a reload mid-funnel must not
// throw away twenty answers. Step index rides along so it resumes in place.

const KEY = 'reprush_onboarding_v2';

export interface Saved {
  step: number;
  answers: Answers;
}

export function loadProgress(): Saved | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.step !== 'number' || !parsed?.answers) return null;
    return {
      // A shipped step list can be shorter than the saved index.
      step: Math.max(0, Math.min(STEPS.length - 1, parsed.step)),
      answers: { ...DEFAULT_ANSWERS, ...parsed.answers },
    };
  } catch {
    return null;
  }
}

export function saveProgress(step: number, answers: Answers) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ step, answers }));
  } catch {
    /* private mode / quota — the funnel still works, it just won't resume */
  }
}

export function clearProgress() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// ── self-check ──────────────────────────────────────────────────────
// Runs at module load. Everything it asserts is over constants, so if it
// passes in a build it passes at runtime — a mis-wired step id would
// otherwise surface as a blank screen halfway through signup.

export const __selfcheck = () => {
  const fail = (m: string) => {
    throw new Error(`onboarding config: ${m}`);
  };

  if (new Set(STEPS.map((s) => s.id)).size !== STEPS.length) fail('duplicate step id');

  for (const s of STEPS) {
    if (s.kind === 'custom') continue;
    if (!(s.field in DEFAULT_ANSWERS)) fail(`${s.id} writes unknown field ${s.field}`);
    if (!s.options.length) fail(`${s.id} has no options`);
    if (new Set(s.options.map((o) => o.value)).size !== s.options.length)
      fail(`${s.id} has duplicate option values`);
    if (s.kind === 'multi' && s.exclusive && !s.options.some((o) => o.value === s.exclusive))
      fail(`${s.id}'s exclusive option is not in its list`);
  }

  // The backend allow-lists these; a value that isn't on both lists is silently
  // dropped at register time, which looks like the answer never saved.
  const backend: Record<string, string[]> = {
    experience: ['never', 'beginner', 'intermediate', 'advanced'],
    goal: ['muscle', 'strength', 'fat_loss', 'health', 'athletic'],
    sex: ['male', 'female'],
    trainingLocation: ['big_gym', 'small_gym', 'home', 'outdoors', 'travelling'],
  };
  for (const s of STEPS) {
    if (s.kind !== 'choice' || !backend[s.field]) continue;
    for (const o of s.options)
      if (!backend[s.field].includes(o.value)) fail(`${s.id}: "${o.value}" is not accepted by /auth/register`);
  }
  // Same for limitations, minus the UI-only "none".
  const limits = STEPS.find((s) => s.id === 'limitations');
  if (limits?.kind !== 'multi') fail('limitations step is missing');
  else
    for (const o of limits.options)
      if (o.value !== 'none' && !['back', 'knees', 'shoulders', 'wrists'].includes(o.value))
        fail(`limitations: "${o.value}" is not accepted by /auth/register`);

  for (const [loc, list] of Object.entries(EQUIPMENT_PRESET)) {
    if (!list.length) fail(`${loc} preset is empty`);
    for (const e of list) if (!ALL_EQUIPMENT.includes(e)) fail(`${loc} presets unknown equipment ${e}`);
  }
  const locations = STEPS.find((s) => s.id === 'location');
  if (locations?.kind === 'choice')
    for (const o of locations.options)
      if (!EQUIPMENT_PRESET[o.value]) fail(`location "${o.value}" has no equipment preset`);

  // Unit round-trips, because a wrong one mis-ranks every imperial user.
  if (Math.abs(lbToKg(kgToLb(80)) - 80) > 1e-9) fail('kg⇄lb round trip drifted');
  if (Math.abs(inToCm(cmToIn(178)) - 178) > 1e-9) fail('cm⇄in round trip drifted');
  if (Math.abs(kgToLb(100) - 220.462) > 0.01) fail('100 kg should be ~220.46 lb');
  if (feetInches(70) !== '5′ 10″') fail('70 in should read 5′ 10″');
  if (feetInches(72) !== '6′ 0″') fail('72 in should read 6′ 0″');

  // Local-time constructor on purpose — this is the calendar the user sees.
  if (birthDateFromAge(25, new Date(2026, 7, 7, 3, 0)) !== '2001-08-07')
    fail('age 25 on 2026-08-07 should be born 2001-08-07');
  if (birthDateFromAge(30, new Date(2026, 0, 1, 23, 30)) !== '1996-01-01')
    fail('late-evening 1 January must not roll into the next day');

  return 'onboarding config ok';
};

__selfcheck();

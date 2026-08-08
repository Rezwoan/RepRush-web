/** Shapes mirroring `backend/src/profile/profile.service.ts`. */
import type { Rank } from '@/lib/ranks';
import { cmToIn, inToCm, kgToLb, lbToKg, type Units } from '@/lib/units';

export interface Cosmetic {
  id: string;
  kind: 'title' | 'border' | 'banner' | 'theme';
  label: string;
  price: number;
  paint: string;
  free?: boolean;
  owned?: boolean;
}

export interface ProfileHeader {
  id: number;
  name: string;
  username: string | null;
  bio: string | null;
  avatarId: string | null;
  profileImage: string | null;
  joinedAt: string;
  currency: number;
  cosmetics: { title: Cosmetic; border: Cosmetic; banner: Cosmetic };
  /** The three you wear — resolved by the backend, drawn on the banner. */
  medals: { id: string; label: string; emblem: string; material: string }[];
}

/**
 * The preference shape had three copies — the backend's `DEFAULT_PREFERENCES`,
 * `lib/feedback.ts`'s `DEFAULTS`, and this one. Two is the minimum (the backend
 * is the boundary that validates), and `feedback.ts` is already the file that
 * declares itself the mirror, so this defers to it. Adding a preference is now
 * two edits instead of three — which matters, because a key missing from one
 * copy is exactly how P13 shipped six settings nothing read.
 */
import type { Prefs } from '@/lib/feedback';

export type Preferences = Prefs;

export interface Overview {
  header: ProfileHeader;
  preferences: Preferences;
  layout: string[];
  /** 14 consecutive days ending today — exactly two weeks, so a 7-column
   *  grid of them is weekday-aligned and can carry one header row. */
  memories: { date: string; muscles: string[]; title: string | null; sets: number }[];
  last7: Record<string, number>;
  totals: {
    window: number;
    duration: number;
    volume: number;
    reps: number;
    series: { date: string; duration: number; volume: number; reps: number }[];
  };
  streaks: { current: number; best: number; days: { date: string; trained: boolean }[] };
  levels: {
    level: number;
    intoLevel: number;
    nextLevelXp: number;
    totalXp: number;
    records: number;
    workouts: number;
  };
  ranks: {
    bodyrank: { rank: Rank; predicted: boolean; placements: { done: number; required: number } };
    best: Rank;
    /** Position on the global Bodyrank board — the profile card's overall rank. */
    standing: { position: number | null; of: number };
  };
  activity: { week: string; workouts: number }[];
  counts: { routines: number; exercises: number; reactions: number };
}

export const CARD_TITLE: Record<string, string> = {
  memories: 'Memories',
  last7: 'Last 7 Days',
  totals: 'Totals',
  streaks: 'Streaks',
  levels: 'Levels',
  ranks: 'Ranks',
  activity: '6-Month Activity',
  routines: 'Routines',
  exercises: 'Exercises',
  reactions: 'Reactions',
};

export const METRIC_LABEL: Record<string, string> = {
  bodyweight: 'Bodyweight',
  height: 'Height',
  waist: 'Waist',
  bodyFat: 'Body Fat',
  neck: 'Neck',
  shoulder: 'Shoulder',
  chest: 'Chest',
  leftBicep: 'Left Bicep',
  rightBicep: 'Right Bicep',
  leftThigh: 'Left Thigh',
  rightThigh: 'Right Thigh',
  hip: 'Hip',
};

/**
 * Health values are stored metric — kg for bodyweight, cm for everything that
 * is a length (height and the eight circumferences). These turn one into what
 * the profile asked to see, and back again on the way in.
 */
export const metricUnit = (metric: string, u: Units) =>
  metric === 'bodyFat' ? '%' : metric === 'bodyweight' ? u.w : u.imperial ? 'in' : 'cm';

export const metricToDisplay = (metric: string, v: number, u: Units) =>
  metric === 'bodyFat' || !u.imperial ? v : metric === 'bodyweight' ? kgToLb(v) : cmToIn(v);

export const metricToStored = (metric: string, v: number, u: Units) =>
  metric === 'bodyFat' || !u.imperial ? v : metric === 'bodyweight' ? lbToKg(v) : inToCm(v);

export const hhmm = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

/**
 * The shapes `GET /ranks/*` returns — mirrors `backend/src/ranks/ranks.service.ts`.
 * Shared by the six sub-tabs, which is the only reason this is not inline.
 */
import type { Rank } from '@/lib/ranks';

export interface NextTarget {
  percentile: number;
  rank: Rank;
  weightKg: number | null;
  reps: number;
  /** 0–1 through the current division. */
  progress: number;
}

export interface ExerciseRank {
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  rank: Rank;
  bestE1rm: number;
  bestWeightKg: number;
  bestReps: number;
  lastTrainedAt: string;
  sets: number;
  next: NextTarget | null;
}

export interface MuscleRank {
  muscleId: string;
  label: string;
  group: string;
  view: string;
  size: number;
  rank: Rank;
  exercises: number;
  lastTrainedAt: string | null;
  decay: number;
}

export interface Overview {
  bodyrank: {
    rank: Rank;
    predicted: boolean;
    placements: { done: number; required: number };
    musclesTrained: number;
    weeklyLp: number;
  };
  muscles: MuscleRank[];
  exercises: ExerciseRank[];
  /** ISO timestamps of every band crossed, oldest first. */
  rankUps: string[];
  /** Analysis → Average Ranks. Averaged server-side, where the ladder lives. */
  categories: { category: string; rank: Rank; count: number }[];
}

export interface LeagueRow {
  userId: number;
  name: string;
  avatarId: string | null;
  weeklyLp: number;
  rank: Rank;
  you: boolean;
}

export interface Leagues {
  season: { week: string; endsAt: string };
  division: { index: number; size: number };
  promoteTop: number;
  demoteBottom: number;
  rows: LeagueRow[];
}

/** The tier's brand colour, which is the same token everywhere in the app. */
export const tierColor = (rank: Rank | null | undefined) =>
  `hsl(var(--tier-${rank?.tier ?? 'unranked'}))`;

/**
 * "100 kg × 5", or "8 reps" for a bodyweight movement.
 *
 * A pull-up is logged with weightKg 0 — that is the added weight, not the load
 * — so the obvious template renders "Best 0 kg × 8", which reads as a bug.
 */
export const bestLabel = (weightKg: number, reps: number) =>
  weightKg > 0 ? `${weightKg} kg × ${reps}` : `${reps} reps`;

/** Same idea for a prescription: bodyweight lifts promote on reps. */
export const targetLabel = (n: NextTarget) =>
  n.weightKg === null || n.weightKg <= 0 ? `${n.reps} reps` : `${n.weightKg}×${n.reps}`;

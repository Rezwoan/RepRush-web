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

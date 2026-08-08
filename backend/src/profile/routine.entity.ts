import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** A folder of routines (SPEC §12.3). Empty folders exist, so this is a row. */
@Entity('routine_folders')
export class RoutineFolder {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  name: string;

  /**
   * The program the Workout tab opens on. Null everywhere except at most one
   * folder per user — `setDefaultFolder` clears the others in the same write.
   * Nullable, like every column added to an existing table (MEMORY → Decisions).
   */
  @Column({ nullable: true })
  isDefault: boolean;

  /** Set when this folder came from a routine package, so the Store can tell. */
  @Column({ nullable: true })
  packageId: string;

  /**
   * Share link code, allocated on first share. Same shape and same reasoning as
   * `User.referralCode`: a unique *index* rather than a unique column, because a
   * unique column makes SQLite rebuild the table on the next `synchronize`.
   */
  @Index({ unique: true })
  @Column({ nullable: true })
  shareCode: string;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * A saved workout (SPEC §12.3) — a name and a list of exercises.
 *
 * The exercise list is a JSON blob for the same reason `gym_sessions.plan` is:
 * it is written whole, read whole, never queried by any of its fields, and
 * sql.js rewrites the entire database file on every flush.
 */
@Entity('routines')
export class Routine {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  name: string;

  /** Null = loose, outside any folder. */
  @Column({ nullable: true })
  folderId: number;

  /** JSON: `{ exerciseId, name, sets, repMin, repMax, restSec }[]`. */
  @Column({ type: 'text' })
  exercises: string;

  /**
   * Last time this routine was started. What makes a six-day split rotate:
   * the Workout tab suggests the day you have gone longest without, rather than
   * asking you to remember where you are in the week.
   */
  @Column({ nullable: true })
  lastUsedAt: Date;

  /** Position within its folder — a program's days have an order. */
  @Column({ nullable: true })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * An exercise the user wrote themselves (`Create Exercise`, deferred here from
 * P6). Deliberately shaped like a catalog entry so the picker, the generator
 * and the rank engine can treat it as one — its id is `custom:<n>`.
 */
@Entity('user_exercises')
export class UserExercise {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  name: string;

  /** Our muscle id — the one the rank engine scores against. */
  @Column()
  primaryMuscle: string;

  @Column()
  equipment: string;

  /** 'compound' | 'isolation' — picks the strength-standards multiplier. */
  @Column({ nullable: true })
  mechanic: string;

  @CreateDateColumn()
  createdAt: Date;
}

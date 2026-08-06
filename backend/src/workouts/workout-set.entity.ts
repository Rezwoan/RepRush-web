import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { GymSession } from './gym-session.entity';

@Entity('workout_sets')
export class WorkoutSet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sessionId: number;

  @ManyToOne(() => GymSession, (session) => session.sets)
  @JoinColumn({ name: 'sessionId' })
  session: GymSession;

  @Column()
  exerciseName: string;

  /**
   * Catalog id (`backend/data/exercises.json`). Nullable because v1 history only
   * ever had the free-text name; the backfill in `SeedService` fills it in where
   * a match exists. `exerciseName` stays as the display/fallback label.
   */
  @Column({ nullable: true })
  exerciseId: string;

  /** Rate of perceived exertion, 1–10. Feeds the recovery model (SPEC §10). */
  @Column({ type: 'real', nullable: true })
  rpe: number;

  /** LP this set awarded, written by the rank engine so awards stay idempotent. */
  @Column({ type: 'real', nullable: true })
  lpAwarded: number;

  @Column()
  setNumber: number;

  @Column({ nullable: true })
  targetReps: number;

  @Column()
  actualReps: number;

  @Column({ type: 'real' })
  weightKg: number;

  @Column({ default: false })
  isWarmup: boolean;

  // DEPRECATED — the weight estimator was removed; nothing reads or writes this.
  // Kept only so `synchronize: true` doesn't rebuild the workout_set table (and
  // risk live training history) just to drop an unused nullable column.
  @Column({ type: 'real', nullable: true })
  suggestedWeight: number;

  @CreateDateColumn()
  loggedAt: Date;
}

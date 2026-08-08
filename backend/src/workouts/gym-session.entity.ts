import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { WorkoutSet } from './workout-set.entity';

@Entity('gym_sessions')
export class GymSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  workoutPlanId: number;

  /**
   * The routine this session was started from, when it was started from one.
   *
   * Carried on the session rather than stamped straight onto the routine,
   * because the stamp is what rotates the split and a session that gets
   * discarded must not rotate anything. `completeSession` is what writes
   * `routines.lastUsedAt`, and this is how it knows which day to write it to.
   */
  @Column({ nullable: true })
  routineId: number;

  @Column({ nullable: true })
  workoutType: string;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ nullable: true, type: 'datetime' })
  completedAt: Date;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  /**
   * The generated plan, as JSON (`GeneratedWorkout` from `generator.ts`).
   *
   * A blob rather than rows because it is written once at session start, read
   * whole, and never queried by any of its fields — and because sql.js rewrites
   * the whole database file on flush, so a plan_exercises table would tax every
   * unrelated write. The *logged* sets are the durable record; this is the
   * prescription the user was working from, kept so a resumed session still
   * knows what was left to do.
   */
  @Column({ nullable: true, type: 'text' })
  plan: string;

  /**
   * Finish-flow fields (SPEC §5.3). `notes` above is the in-session notepad and
   * already existed in v1; this is the caption written on the way out.
   *
   * `tracked` is nullable with null meaning true, rather than `default: true`.
   * A NOT NULL column added to an existing table is the change that can make
   * SQLite rebuild `gym_sessions` under `synchronize`, and that table holds
   * every session anyone has ever logged.
   */
  @Column({ nullable: true, type: 'text' })
  caption: string;

  @Column({ nullable: true })
  tracked: boolean;

  /** 'private' | 'friends' | 'discovery'. Posts themselves land in P9. */
  @Column({ nullable: true })
  privacy: string;

  @OneToMany(() => WorkoutSet, (set) => set.session, { cascade: true })
  sets: WorkoutSet[];
}

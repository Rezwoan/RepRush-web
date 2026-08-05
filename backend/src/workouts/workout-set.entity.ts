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

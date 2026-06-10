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

  // The weight the estimator suggested when this set was logged (hint shown to
  // the user). Captured for accuracy analysis; null for warm-ups / off-plan.
  @Column({ type: 'real', nullable: true })
  suggestedWeight: number;

  @CreateDateColumn()
  loggedAt: Date;
}

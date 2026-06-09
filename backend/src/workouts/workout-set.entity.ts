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

  @CreateDateColumn()
  loggedAt: Date;
}

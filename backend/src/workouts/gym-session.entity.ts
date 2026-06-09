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

  @Column({ nullable: true })
  workoutType: string;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ nullable: true, type: 'datetime' })
  completedAt: Date;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @OneToMany(() => WorkoutSet, (set) => set.session, { cascade: true })
  sets: WorkoutSet[];
}

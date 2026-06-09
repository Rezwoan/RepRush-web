import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { ExercisePlan } from './exercise-plan.entity';

@Entity('user_plans')
export class UserPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  planId: number;

  @ManyToOne(() => ExercisePlan)
  @JoinColumn({ name: 'planId' })
  plan: ExercisePlan;

  @Column({ type: 'text', nullable: true })
  customWeights: string; // JSON: { "bench_press": 80, "squat": 100 }

  @CreateDateColumn()
  assignedAt: Date;
}

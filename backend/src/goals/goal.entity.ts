import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type GoalType = 'bodyweight' | 'lift';

/** A personal goal: reach a target body weight, or lift a target weight on a program exercise. */
@Entity('goals')
export class Goal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  type: GoalType;

  @Column({ nullable: true })
  exerciseName: string; // for type 'lift'

  @Column({ type: 'real' })
  targetValue: number;

  @Column({ type: 'real', nullable: true })
  startValue: number; // metric value when the goal was created (for progress %)

  @Column({ nullable: true, type: 'datetime' })
  achievedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}

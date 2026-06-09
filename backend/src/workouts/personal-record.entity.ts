import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum ExerciseType {
  BENCH = 'bench',
  SQUAT = 'squat',
  DEADLIFT = 'deadlift',
  OTHER = 'other',
}

@Entity('personal_records')
export class PersonalRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  exerciseType: string;

  @Column({ type: 'real' })
  weightKg: number;

  @Column()
  reps: number;

  @Column({ nullable: true })
  date: string;

  @Column({ nullable: true })
  season: string;

  @Column({ default: true })
  isCurrentSeason: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

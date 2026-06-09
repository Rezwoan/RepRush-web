import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('body_weight_logs')
export class BodyWeightLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'float' })
  weightKg: number;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ type: 'text' })
  date: string; // YYYY-MM-DD

  @CreateDateColumn()
  createdAt: Date;
}

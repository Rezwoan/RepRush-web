import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Supplement } from './supplement.entity';

/** A single logged dose of a supplement. */
@Entity('supplement_logs')
export class SupplementLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  supplementId: number;

  @ManyToOne(() => Supplement, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplementId' })
  supplement: Supplement;

  @Column({ type: 'real' })
  amount: number;

  @CreateDateColumn()
  loggedAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

/** A supplement the user tracks (definition), e.g. Magnesium 400 mg. */
@Entity('supplements')
export class Supplement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  name: string;

  @Column({ default: 'mg' })
  unit: string; // mg, g, IU, mcg, ml, capsule

  @Column({ nullable: true })
  color: string; // hex, for heatmap rings + UI accents

  @Column({ type: 'real', nullable: true })
  defaultDose: number;

  @Column({ type: 'real', nullable: true })
  dailyTarget: number;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;
}

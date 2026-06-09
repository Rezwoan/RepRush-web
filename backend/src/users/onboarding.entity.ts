import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('onboarding_progress')
export class OnboardingProgress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @OneToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ default: false })
  hasProfileImage: boolean;

  @Column({ default: false })
  hasHeightWeight: boolean;

  @Column({ default: false })
  hasPRs: boolean;

  @Column({ default: false })
  dismissed: boolean;
}

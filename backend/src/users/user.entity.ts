import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToOne,
  OneToMany,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'text', default: UserRole.USER })
  role: UserRole;

  @Column({ type: 'real', nullable: true })
  heightCm: number;

  @Column({ type: 'real', nullable: true })
  weightKg: number;

  @Column({ nullable: true, type: 'text' })
  profileImage: string;

  @Column({ nullable: true })
  creatineColor: string;

  @Column({ default: true })
  remindWorkouts: boolean;

  @Column({ default: true })
  remindSupplements: boolean;

  @Column({ nullable: true })
  inviteToken: string;

  // ── v2 profile ────────────────────────────────────────────────
  // All nullable: every v1 account predates these and must keep working.

  /**
   * Unique handle, claimed at signup in v2. v1 accounts have none until they pick one.
   * Uniqueness is a separate index on purpose: a `unique: true` *column* makes
   * SQLite rebuild the whole users table (create/copy/drop/rename) on the next
   * `synchronize`, and that is the one operation that can lose live accounts.
   */
  @Index({ unique: true })
  @Column({ nullable: true })
  username: string;

  @Column({ nullable: true, type: 'text' })
  bio: string;

  /** 'male' | 'female' — drives the strength standards table, nothing else. */
  @Column({ nullable: true })
  sex: string;

  /** Date only; the rank engine needs age for its coefficient curve. */
  @Column({ type: 'date', nullable: true })
  birthDate: string;

  @Column({ nullable: true })
  avatarId: string;

  // Onboarding funnel answers (SPEC §3.3) — they shape the workout generator.
  /** 'never' | 'beginner' | 'intermediate' | 'advanced' */
  @Column({ nullable: true })
  experience: string;

  /** 'muscle' | 'strength' | 'fat_loss' | 'health' | 'athletic' */
  @Column({ nullable: true })
  goal: string;

  /** 'big_gym' | 'small_gym' | 'home' | 'outdoors' | 'travelling' */
  @Column({ nullable: true })
  trainingLocation: string;

  /** JSON string[] of equipment ids the user can actually reach. Null = assume everything. */
  @Column({ type: 'text', nullable: true })
  equipment: string;

  /** JSON string[] of body areas to work around ('back' | 'knees' | 'shoulders' | 'wrists'). */
  @Column({ type: 'text', nullable: true })
  limitations: string;

  @Column({ default: false })
  isActivated: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

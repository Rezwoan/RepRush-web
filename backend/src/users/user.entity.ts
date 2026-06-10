import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
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

  @Column({ nullable: true })
  inviteToken: string;

  @Column({ default: false })
  isActivated: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

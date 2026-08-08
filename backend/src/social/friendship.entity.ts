import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * One row per relationship, in the direction it was asked (SPEC §8).
 *
 * A single row rather than a symmetric pair: two rows for one friendship is two
 * things that can disagree, and every read here already has to look at both
 * directions anyway because a request is directional and a friendship is not.
 */
@Entity('friendships')
@Index(['requesterId', 'addresseeId'], { unique: true })
export class Friendship {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  requesterId: number;

  @Column()
  addresseeId: number;

  /** 'pending' | 'accepted'. A decline deletes the row — there is nothing to remember. */
  @Column({ default: 'pending' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true, type: 'datetime' })
  respondedAt: Date;
}

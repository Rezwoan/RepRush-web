import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * One row per reward actually taken (SPEC §10 → Quests, XP & Levels).
 *
 * This is the *only* thing P11 stores, and it exists because a reward you have
 * already banked cannot be re-derived from the sets: the quest that earned it
 * rolls over at midnight, and the currency has already been spent. Everything
 * else — which quests you have, how far along they are, which medals you hold,
 * how long your streak is — stays derived, the same call ranks (P3), leagues
 * (P7) and posts (P9) made.
 *
 * `key` identifies the reward for all time: `quest:daily:2026-08-07:streak`,
 * `quest:weekly:2026-W32:ranks`, `level:3`, `referral:refer-3`. The unique index
 * on (userId, key) is what makes claiming idempotent — an outbox retry hits the
 * constraint instead of paying out twice.
 */
@Entity('reward_claims')
@Index(['userId', 'key'], { unique: true })
export class RewardClaim {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  key: string;

  @Column({ type: 'integer', default: 0 })
  xp: number;

  @Column({ type: 'integer', default: 0 })
  currency: number;

  @CreateDateColumn()
  claimedAt: Date;
}

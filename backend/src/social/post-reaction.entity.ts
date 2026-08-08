import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * A reaction to a post — and a post *is* a completed `gym_sessions` row whose
 * privacy is `friends` or `discovery`, so these key off `sessionId`.
 *
 * There is no `posts` table on purpose, the same call ranks and leagues made: a
 * post carries no information the session does not already have, so a copy of
 * it could only ever drift from the sets it claims to describe. Privacy is the
 * one field that makes it a post, and it already lives on the session.
 */
@Entity('post_reactions')
@Index(['sessionId', 'userId'], { unique: true })
export class PostReaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sessionId: number;

  @Column()
  userId: number;

  /** One of `REACTIONS` in `social.service.ts`. One per user per post, replaceable. */
  @Column()
  emoji: string;

  @CreateDateColumn()
  createdAt: Date;
}

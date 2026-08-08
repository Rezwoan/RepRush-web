import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** A comment on a post (i.e. on a completed session — see `PostReaction`). */
@Entity('post_comments')
export class PostComment {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  sessionId: number;

  @Column()
  userId: number;

  @Column({ type: 'text' })
  text: string;

  @CreateDateColumn()
  createdAt: Date;
}

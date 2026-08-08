import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * One measurement of one body metric (SPEC §12.2).
 *
 * One table with a `metric` column rather than a table per measurement — they
 * are the same shape and the Health screen renders them through the same chart.
 *
 * **Bodyweight is deliberately not stored here.** It already has
 * `body_weight_logs`, which the Home card, the rank engine's bodyweight ratio
 * and the finish flow all read; moving it would be a data migration on the one
 * number the whole ladder is scaled against. `ProfileService.health()` reads
 * bodyweight from there and everything else from here, so the screen shows one
 * list either way.
 */
@Entity('health_logs')
export class HealthLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  /** One of `HEALTH_METRICS` in `profile.service.ts`. */
  @Column()
  metric: string;

  @Column({ type: 'real' })
  value: number;

  /** `YYYY-MM-DD`, the day it was measured — not when it was typed in. */
  @Column()
  date: string;

  @CreateDateColumn()
  createdAt: Date;
}

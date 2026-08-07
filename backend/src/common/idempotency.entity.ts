import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * One row per write the client has already had accepted (SPEC §10 → Offline).
 *
 * The outbox retries anything it did not see a response to — and a request that
 * reached the server, wrote its row and then lost the connection looks exactly
 * like one that never arrived. Without this, that retry logs the set twice.
 *
 * Every queued write carries `X-Idempotency-Key` (the outbox op's own id), and
 * `IdempotencyInterceptor` refuses to run the handler a second time for the
 * same (user, key). One guard at the boundary rather than a dedupe rule per
 * endpoint, because the next write path would forget to add one.
 */
@Entity('idempotency_keys')
@Index(['userId', 'key'], { unique: true })
export class IdempotencyKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  key: string;

  @CreateDateColumn()
  createdAt: Date;
}

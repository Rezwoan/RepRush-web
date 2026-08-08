import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Observable, of } from 'rxjs';
import { IdempotencyKey } from './idempotency.entity';

const HEADER = 'x-idempotency-key';
/** Long enough to cover a phone that spent the weekend in a drawer. */
const TTL_DAYS = 30;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private swept = 0;

  constructor(
    @InjectRepository(IdempotencyKey) private keys: Repository<IdempotencyKey>,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const key = String(req.headers?.[HEADER] ?? '').slice(0, 64);
    const userId = req.user?.id;

    // Reads and unauthenticated calls are not replays worth guarding.
    if (!key || !userId || req.method === 'GET') return next.handle();

    try {
      await this.keys.save(this.keys.create({ userId, key }));
    } catch {
      // The unique index says this exact write already happened. Returning the
      // handler's original response would need it stored; the outbox only needs
      // to know it succeeded, and every queued write is a fire-and-forget.
      return of({ ok: true, duplicate: true });
    }

    void this.sweep();
    return next.handle();
  }

  /**
   * ponytail: swept lazily, at most once an hour, rather than by a cron. The
   * table is tiny and nothing reads an expired row; a scheduled job for this
   * would be a moving part with no user-visible job.
   */
  private async sweep() {
    if (Date.now() - this.swept < 3_600_000) return;
    this.swept = Date.now();
    await this.keys
      .delete({ createdAt: LessThan(new Date(Date.now() - TTL_DAYS * 86_400_000)) })
      .catch(() => undefined);
  }
}

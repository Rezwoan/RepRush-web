import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from './idempotency.entity';
import { IdempotencyInterceptor } from './idempotency.interceptor';

/**
 * Global because the guarantee has to hold for *every* write, including ones
 * added later by someone who never reads this file.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKey])],
  providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
})
export class CommonModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplement } from './supplement.entity';
import { SupplementLog } from './supplement-log.entity';
import { SupplementsService } from './supplements.service';
import { SupplementsController } from './supplements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Supplement, SupplementLog])],
  providers: [SupplementsService],
  controllers: [SupplementsController],
  exports: [SupplementsService],
})
export class SupplementsModule {}

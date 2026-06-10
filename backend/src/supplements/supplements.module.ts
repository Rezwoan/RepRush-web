import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplement } from './supplement.entity';
import { SupplementLog } from './supplement-log.entity';
import { SupplementsService } from './supplements.service';
import { SupplementsController } from './supplements.controller';
import { CreatineLog } from '../creatine/creatine-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Supplement, SupplementLog, CreatineLog])],
  providers: [SupplementsService],
  controllers: [SupplementsController],
  exports: [SupplementsService],
})
export class SupplementsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BodyWeightLog } from './body-weight-log.entity';
import { BodyWeightService } from './body-weight.service';
import { BodyWeightController } from './body-weight.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BodyWeightLog])],
  providers: [BodyWeightService],
  controllers: [BodyWeightController],
  exports: [BodyWeightService],
})
export class BodyWeightModule {}

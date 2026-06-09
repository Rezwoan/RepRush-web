import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreatineLog } from './creatine-log.entity';
import { CreatineService } from './creatine.service';
import { CreatineController } from './creatine.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CreatineLog])],
  providers: [CreatineService],
  controllers: [CreatineController],
  exports: [CreatineService],
})
export class CreatineModule {}

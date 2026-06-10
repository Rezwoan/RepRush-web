import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from './goal.entity';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { UsersModule } from '../users/users.module';
import { WorkoutsModule } from '../workouts/workouts.module';
import { BodyWeightModule } from '../body-weight/body-weight.module';

@Module({
  imports: [TypeOrmModule.forFeature([Goal]), UsersModule, WorkoutsModule, BodyWeightModule],
  providers: [GoalsService],
  controllers: [GoalsController],
})
export class GoalsModule {}

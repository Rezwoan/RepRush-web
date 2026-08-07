import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExercisesModule } from '../exercises/exercises.module';
import { User } from '../users/user.entity';
import { GymSession } from '../workouts/gym-session.entity';
import { WorkoutSet } from '../workouts/workout-set.entity';
import { RanksService } from './ranks.service';
import { RanksController } from './ranks.controller';

@Module({
  imports: [ExercisesModule, TypeOrmModule.forFeature([WorkoutSet, GymSession, User])],
  providers: [RanksService],
  controllers: [RanksController],
  exports: [RanksService],
})
export class RanksModule {}

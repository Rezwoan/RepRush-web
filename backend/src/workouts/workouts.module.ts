import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GymSession } from './gym-session.entity';
import { WorkoutSet } from './workout-set.entity';
import { PersonalRecord } from './personal-record.entity';
import { WorkoutsService } from './workouts.service';
import { WorkoutsController } from './workouts.controller';
import { UsersModule } from '../users/users.module';
import { ExercisesModule } from '../exercises/exercises.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GymSession, WorkoutSet, PersonalRecord]),
    UsersModule,
    // For the catalog lookup in logSet — a set without an exerciseId is
    // invisible to the rank engine and the recovery model.
    ExercisesModule,
  ],
  providers: [WorkoutsService],
  controllers: [WorkoutsController],
  exports: [WorkoutsService],
})
export class WorkoutsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GymSession } from './gym-session.entity';
import { WorkoutSet } from './workout-set.entity';
import { PersonalRecord } from './personal-record.entity';
import { Routine } from '../profile/routine.entity';
import { WorkoutsService } from './workouts.service';
import { WorkoutsController } from './workouts.controller';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { ExercisesModule } from '../exercises/exercises.module';
import { RanksModule } from '../ranks/ranks.module';

@Module({
  imports: [
    // `Routine` is registered here as a repository, not by importing
    // ProfileModule — starting a routine only needs to read its rows, and a
    // module edge between these two would be a cycle waiting to happen.
    TypeOrmModule.forFeature([GymSession, WorkoutSet, PersonalRecord, User, Routine]),
    UsersModule,
    // For the catalog lookup in logSet — a set without an exerciseId is
    // invisible to the rank engine and the recovery model.
    ExercisesModule,
    // The generator needs recovery and muscle ranks. No cycle: RanksModule
    // reaches the sets through the repository, not through this module.
    RanksModule,
  ],
  providers: [WorkoutsService],
  controllers: [WorkoutsController],
  exports: [WorkoutsService],
})
export class WorkoutsModule {}

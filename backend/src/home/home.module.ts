import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { GymSession } from '../workouts/gym-session.entity';
import { WorkoutSet } from '../workouts/workout-set.entity';
import { PersonalRecord } from '../workouts/personal-record.entity';
import { BodyWeightLog } from '../body-weight/body-weight-log.entity';
import { ExercisesModule } from '../exercises/exercises.module';
import { RanksModule } from '../ranks/ranks.module';
import { GoalsModule } from '../goals/goals.module';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, GymSession, WorkoutSet, PersonalRecord, BodyWeightLog]),
    ExercisesModule,
    RanksModule,
    GoalsModule,
  ],
  providers: [HomeService],
  controllers: [HomeController],
})
export class HomeModule {}

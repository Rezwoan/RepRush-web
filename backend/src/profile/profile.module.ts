import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { GymSession } from '../workouts/gym-session.entity';
import { WorkoutSet } from '../workouts/workout-set.entity';
import { BodyWeightLog } from '../body-weight/body-weight-log.entity';
import { PostReaction } from '../social/post-reaction.entity';
import { RewardClaim } from '../gamification/claim.entity';
import { ExercisesModule } from '../exercises/exercises.module';
import { RanksModule } from '../ranks/ranks.module';
import { HealthLog } from './health-log.entity';
import { Routine, RoutineFolder, UserExercise } from './routine.entity';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      GymSession,
      WorkoutSet,
      BodyWeightLog,
      PostReaction,
      RewardClaim,
      HealthLog,
      Routine,
      RoutineFolder,
      UserExercise,
    ]),
    ExercisesModule,
    RanksModule,
  ],
  providers: [ProfileService],
  controllers: [ProfileController],
  exports: [ProfileService],
})
export class ProfileModule {}

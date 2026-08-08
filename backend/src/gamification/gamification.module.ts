import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { GymSession } from '../workouts/gym-session.entity';
import { WorkoutSet } from '../workouts/workout-set.entity';
import { ExercisesModule } from '../exercises/exercises.module';
import { RanksModule } from '../ranks/ranks.module';
import { RewardClaim } from './claim.entity';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, GymSession, WorkoutSet, RewardClaim]),
    ExercisesModule,
    RanksModule,
  ],
  providers: [GamificationService],
  controllers: [GamificationController],
  exports: [GamificationService],
})
export class GamificationModule {}

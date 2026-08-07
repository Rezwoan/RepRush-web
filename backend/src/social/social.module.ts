import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { GymSession } from '../workouts/gym-session.entity';
import { WorkoutSet } from '../workouts/workout-set.entity';
import { ExercisesModule } from '../exercises/exercises.module';
import { RanksModule } from '../ranks/ranks.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { Friendship } from './friendship.entity';
import { PostReaction } from './post-reaction.entity';
import { PostComment } from './post-comment.entity';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, GymSession, WorkoutSet, Friendship, PostReaction, PostComment]),
    ExercisesModule,
    // Rank chips on posts and the Bodyrank/LP leaderboard metrics.
    RanksModule,
    // v1's relative-strength / Wilks / progress-rate boards, folded in as
    // metrics rather than rewritten.
    LeaderboardModule,
  ],
  providers: [SocialService],
  controllers: [SocialController],
  exports: [SocialService],
})
export class SocialModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardController } from './leaderboard.controller';
import { WorkoutsModule } from '../workouts/workouts.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), WorkoutsModule],
  providers: [LeaderboardService],
  controllers: [LeaderboardController],
  // P9 folds these three boards in as extra metrics on `/social/leaderboard`.
  exports: [LeaderboardService],
})
export class LeaderboardModule {}

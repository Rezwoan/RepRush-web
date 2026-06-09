import { Module } from '@nestjs/common';
import { AchievementsService } from './achievements.service';
import { AchievementsController } from './achievements.controller';
import { UsersModule } from '../users/users.module';
import { WorkoutsModule } from '../workouts/workouts.module';

@Module({
  imports: [UsersModule, WorkoutsModule],
  providers: [AchievementsService],
  controllers: [AchievementsController],
})
export class AchievementsModule {}

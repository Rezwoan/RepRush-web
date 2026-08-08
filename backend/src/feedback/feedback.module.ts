import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feedback } from './feedback.entity';
import { User } from '../users/user.entity';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';

/**
 * Feedback (`docs/v2/FEEDBACK.md`).
 *
 * `User` is registered as a repository rather than by importing `UsersModule`:
 * the admin list only needs to read names to label rows, and a module edge for
 * one lookup is a dependency this does not need. Same call `WorkoutsModule`
 * makes for `Routine`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Feedback, User])],
  providers: [FeedbackService],
  controllers: [FeedbackController],
  exports: [FeedbackService],
})
export class FeedbackModule {}

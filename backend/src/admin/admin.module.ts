import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { WorkoutsModule } from '../workouts/workouts.module';
import { ExercisesModule } from '../exercises/exercises.module';
import { BodyWeightModule } from '../body-weight/body-weight.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), UsersModule, WorkoutsModule, ExercisesModule, BodyWeightModule, MailModule],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}

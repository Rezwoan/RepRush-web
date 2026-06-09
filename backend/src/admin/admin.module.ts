import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { WorkoutsModule } from '../workouts/workouts.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), UsersModule, WorkoutsModule, MailModule],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}

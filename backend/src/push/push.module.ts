import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PushSubscription } from './push-subscription.entity';
import { User } from '../users/user.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { CreatineModule } from '../creatine/creatine.module';
import { WorkoutsModule } from '../workouts/workouts.module';

@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription, User]), ConfigModule, CreatineModule, WorkoutsModule],
  providers: [PushService],
  controllers: [PushController],
  exports: [PushService],
})
export class PushModule {}

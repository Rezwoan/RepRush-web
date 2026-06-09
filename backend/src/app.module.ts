import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WorkoutsModule } from './workouts/workouts.module';
import { ExercisesModule } from './exercises/exercises.module';
import { CreatineModule } from './creatine/creatine.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { AchievementsModule } from './achievements/achievements.module';
import { AdminModule } from './admin/admin.module';
import { MailModule } from './mail/mail.module';
import { BodyWeightModule } from './body-weight/body-weight.module';
import { SeedModule } from './seed/seed.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'sqljs',
        location: join(__dirname, '..', 'database', 'reprush.db'),
        autoSave: true,
        useLocalForage: false,
        entities: [join(__dirname, '**', '*.entity{.ts,.js}')],
        synchronize: true, // auto-creates tables; disable in production
        logging: false,
      }),
    }),
    AuthModule,
    UsersModule,
    WorkoutsModule,
    ExercisesModule,
    CreatineModule,
    LeaderboardModule,
    AchievementsModule,
    AdminModule,
    MailModule,
    BodyWeightModule,
    SeedModule,
  ],
})
export class AppModule {}

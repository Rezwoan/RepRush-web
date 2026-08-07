import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';
import { RanksModule } from '../ranks/ranks.module';

@Module({
  imports: [
    UsersModule,
    // Signup logs the onboarding lift as a real set, so a new account's rank is
    // there the moment the funnel promised it. Same operation as the
    // Calculator's Save Rank, so it lives once, in RanksService.
    RanksModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') || 'fallback-dev-secret',
        signOptions: { expiresIn: config.get('JWT_EXPIRY') || '30d' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

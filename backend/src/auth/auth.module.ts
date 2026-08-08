import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { ClerkService } from './clerk.service';
import { UsersModule } from '../users/users.module';
import { RanksModule } from '../ranks/ranks.module';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [
    UsersModule,
    // Signup claims a username and a referral code, both of which are P9's
    // rules — signup is a caller, not a second implementation.
    SocialModule,
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
  providers: [AuthService, JwtStrategy, ClerkService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, ClerkService],
})
export class AuthModule {}

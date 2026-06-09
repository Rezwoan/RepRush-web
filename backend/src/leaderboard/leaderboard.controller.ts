import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LeaderboardService } from './leaderboard.service';

@UseGuards(JwtAuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private leaderboardService: LeaderboardService) {}

  @Get('relative-strength')
  getRelativeStrength() {
    return this.leaderboardService.getRelativeStrengthLeaderboard();
  }

  @Get('wilks')
  getWilks() {
    return this.leaderboardService.getWilksLeaderboard();
  }

  @Get('progress-rate')
  getProgressRate() {
    return this.leaderboardService.getProgressRateLeaderboard();
  }
}

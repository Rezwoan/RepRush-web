import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import { User } from '../users/user.entity';
import { GamificationService } from './gamification.service';

@UseGuards(JwtAuthGuard)
@Controller('gamification')
export class GamificationController {
  constructor(private game: GamificationService) {}

  /** Level, currency, streak, quests and medals — one call for every screen. */
  @Get('me')
  me(@CurrentUser() user: User) {
    return this.game.summary(user.id);
  }

  @Post('claim')
  claim(@CurrentUser() user: User, @Body('key') key: string) {
    return this.game.claim(user.id, key);
  }

  @Post('medals/equip')
  equip(@CurrentUser() user: User, @Body('ids') ids: string[]) {
    return this.game.equipMedals(user.id, ids);
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import { User } from '../users/user.entity';
import { GoalsService } from '../goals/goals.service';
import { HomeService } from './home.service';

@UseGuards(JwtAuthGuard)
@Controller('home')
export class HomeController {
  constructor(
    private home: HomeService,
    private goals: GoalsService,
  ) {}

  /** Everything the Home tab renders (SPEC §4), in one round trip. */
  @Get('summary')
  async summary(@CurrentUser() user: User) {
    const [summary, goals] = await Promise.all([
      this.home.summary(user.id),
      this.goals.list(user.id),
    ]);
    // The card shows one goal: the newest one still in progress, else the newest.
    return { ...summary, goal: goals.find((g: any) => !g.achieved) ?? goals[0] ?? null };
  }
}

import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import { User } from '../users/user.entity';
import { BodyWeightService } from './body-weight.service';

@UseGuards(JwtAuthGuard)
@Controller('body-weight')
export class BodyWeightController {
  constructor(private bodyWeightService: BodyWeightService) {}

  @Post()
  log(@CurrentUser() user: User, @Body() body: { weightKg: number; note?: string }) {
    return this.bodyWeightService.log(user.id, body.weightKg, body.note);
  }

  @Get('history')
  getHistory(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.bodyWeightService.getHistory(user.id, days ? parseInt(days) : 90);
  }

  @Get('latest')
  getLatest(@CurrentUser() user: User) {
    return this.bodyWeightService.getLatest(user.id);
  }
}

import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import { User } from '../users/user.entity';
import { CreatineService } from './creatine.service';

@UseGuards(JwtAuthGuard)
@Controller('creatine')
export class CreatineController {
  constructor(private creatineService: CreatineService) {}

  @Post()
  logDose(@CurrentUser() user: User, @Body() body: { amountGrams: number; note?: string }) {
    return this.creatineService.logDose(user.id, body.amountGrams, body.note);
  }

  @Get('today')
  getToday(@CurrentUser() user: User) {
    return this.creatineService.getTodayLogs(user.id);
  }

  @Get('history')
  getHistory(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.creatineService.getHistory(user.id, days ? parseInt(days) : 30);
  }

  @Delete(':id')
  deleteLog(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.creatineService.deleteLog(id, user.id);
  }
}

import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import { User } from '../users/user.entity';
import { SupplementsService } from './supplements.service';

@UseGuards(JwtAuthGuard)
@Controller('supplements')
export class SupplementsController {
  constructor(private supplementsService: SupplementsService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.supplementsService.list(user.id);
  }

  @Post()
  add(@CurrentUser() user: User, @Body() body: { name: string; unit?: string; defaultDose?: number; dailyTarget?: number }) {
    return this.supplementsService.add(user.id, body);
  }

  @Get('today')
  getToday(@CurrentUser() user: User) {
    return this.supplementsService.getToday(user.id);
  }

  @Get('heatmap')
  getHeatmap(@CurrentUser() user: User, @Query('year') year?: string) {
    return this.supplementsService.getHeatmap(user.id, year ? parseInt(year) : undefined);
  }

  @Post(':id/log')
  logDose(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() body: { amount: number }) {
    return this.supplementsService.logDose(user.id, id, body.amount);
  }

  @Delete('log/:logId')
  deleteLog(@CurrentUser() user: User, @Param('logId', ParseIntPipe) logId: number) {
    return this.supplementsService.deleteLog(user.id, logId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.supplementsService.remove(user.id, id);
  }
}

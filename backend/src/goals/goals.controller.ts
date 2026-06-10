import { Controller, Get, Post, Delete, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import { User } from '../users/user.entity';
import { GoalsService } from './goals.service';
import { GoalType } from './goal.entity';

@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private goalsService: GoalsService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.goalsService.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: { type: GoalType; exerciseName?: string; targetValue: number }) {
    return this.goalsService.create(user.id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.goalsService.remove(user.id, id);
  }
}

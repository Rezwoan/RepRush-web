import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, CurrentUser } from '../auth/decorators';
import { RolesGuard } from '../auth/roles.guard';
import { User, UserRole } from '../users/user.entity';
import { ExercisesService } from './exercises.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('exercises')
export class ExercisesController {
  constructor(private exercisesService: ExercisesService) {}

  // Plans — admin only
  @Roles(UserRole.ADMIN)
  @Post('plans')
  createPlan(@CurrentUser() user: User, @Body() body: { name: string; exercises: any }) {
    return this.exercisesService.createPlan(user.id, body.name, body.exercises);
  }

  @Get('plans')
  getAllPlans() {
    return this.exercisesService.getAllPlans();
  }

  @Get('plans/:id')
  getPlan(@Param('id', ParseIntPipe) id: number) {
    return this.exercisesService.getPlan(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch('plans/:id')
  updatePlan(@Param('id', ParseIntPipe) id: number, @Body() body: { name?: string; exercises?: any }) {
    return this.exercisesService.updatePlan(id, body.name, body.exercises);
  }

  @Roles(UserRole.ADMIN)
  @Delete('plans/:id')
  deletePlan(@Param('id', ParseIntPipe) id: number) {
    return this.exercisesService.deletePlan(id);
  }

  // Assign plan to users (admin)
  @Roles(UserRole.ADMIN)
  @Post('plans/:id/assign')
  assignToAll(@Param('id', ParseIntPipe) id: number, @Body() body: { userIds: number[] }) {
    return this.exercisesService.assignPlanToAll(id, body.userIds);
  }

  @Roles(UserRole.ADMIN)
  @Post('plans/:id/assign/:userId')
  assignToUser(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { customWeights?: Record<string, number> },
  ) {
    return this.exercisesService.assignPlanToUser(userId, id, body.customWeights);
  }

  // User's own plans
  @Get('my-plans')
  getMyPlans(@CurrentUser() user: User) {
    return this.exercisesService.getUserPlans(user.id);
  }

  @Patch('my-plans/:planId/weights')
  updateWeights(
    @CurrentUser() user: User,
    @Param('planId', ParseIntPipe) planId: number,
    @Body() body: { customWeights: Record<string, number> },
  ) {
    return this.exercisesService.updateCustomWeights(user.id, planId, body.customWeights);
  }
}

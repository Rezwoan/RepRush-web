import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import { User } from '../users/user.entity';
import { WorkoutsService } from './workouts.service';

@UseGuards(JwtAuthGuard)
@Controller('workouts')
export class WorkoutsController {
  constructor(private workoutsService: WorkoutsService) {}

  // Sessions
  @Post('sessions')
  startSession(@CurrentUser() user: User, @Body() body: { workoutType: string; workoutPlanId?: number }) {
    return this.workoutsService.startSession(user.id, body.workoutType, body.workoutPlanId);
  }

  @Get('sessions')
  getSessions(@CurrentUser() user: User) {
    return this.workoutsService.getUserSessions(user.id);
  }

  @Get('sessions/:id')
  getSession(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.workoutsService.getSession(id, user.id);
  }

  @Get('sessions/:id/summary')
  getSessionSummary(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.workoutsService.getSessionSummary(id, user.id);
  }

  @Get('exercises')
  getExercises(@CurrentUser() user: User) {
    return this.workoutsService.getExerciseList(user.id);
  }

  @Get('exercises/history')
  getExerciseHistory(@CurrentUser() user: User, @Query('name') name: string) {
    return this.workoutsService.getExerciseHistory(user.id, name);
  }

  @Patch('sessions/:id/complete')
  completeSession(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { notes?: string },
  ) {
    return this.workoutsService.completeSession(id, user.id, body.notes);
  }

  @Delete('sessions/:id')
  resetSession(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.workoutsService.resetSession(id, user.id);
  }

  @Get('heatmap')
  getHeatmap(@CurrentUser() user: User, @Query('year') year?: string) {
    return this.workoutsService.getHeatmapData(user.id, year ? parseInt(year) : undefined);
  }

  // Sets
  @Post('sessions/:id/sets')
  logSet(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) sessionId: number,
    @Body() body: { exerciseName: string; setNumber: number; actualReps: number; weightKg: number; targetReps?: number; isWarmup?: boolean },
  ) {
    return this.workoutsService.logSet(
      sessionId, user.id, body.exerciseName, body.setNumber, body.actualReps, body.weightKg, body.targetReps, body.isWarmup,
    );
  }

  @Delete('sets/:id')
  deleteSet(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.workoutsService.deleteSet(id, user.id);
  }

  // Personal Records
  @Get('prs')
  getPRs(@CurrentUser() user: User) {
    return this.workoutsService.getPRs(user.id);
  }

  @Post('prs')
  createPR(
    @CurrentUser() user: User,
    @Body() body: { exerciseType: string; weightKg: number; reps: number; date?: string; season?: string },
  ) {
    return this.workoutsService.createPR(user.id, body.exerciseType, body.weightKg, body.reps, body.date, body.season);
  }

  // Progressive overload suggestion
  @Get('suggest/:workoutType')
  getSuggestion(@CurrentUser() user: User, @Param('workoutType') workoutType: string) {
    return this.workoutsService.suggestNextSession(user.id, workoutType);
  }
}

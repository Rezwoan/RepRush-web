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

/** Post scopes (SPEC §5.3). Posts themselves arrive in P9; the flag is stored now. */
const PRIVACY = ['private', 'friends', 'discovery'];

@UseGuards(JwtAuthGuard)
@Controller('workouts')
export class WorkoutsController {
  constructor(private workoutsService: WorkoutsService) {}

  /**
   * Build a session (SPEC §5.1). A GET because it reads and writes nothing —
   * the plan only becomes real when the user taps Start Workout.
   */
  @Get('generate')
  generate(
    @CurrentUser() user: User,
    @Query('durationMin') durationMin?: string,
    @Query('difficulty') difficulty?: string,
    @Query('equipment') equipment?: string,
    @Query('muscles') muscles?: string,
  ) {
    const list = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
    return this.workoutsService.generateWorkout(user.id, {
      durationMin: durationMin ? parseInt(durationMin, 10) : undefined,
      difficulty,
      equipment: list(equipment),
      muscles: list(muscles),
    });
  }

  /**
   * A saved routine, as a startable session plan. Same shape as `generate`, so
   * the builder renders either without knowing which it got.
   */
  @Get('from-routine/:id')
  fromRoutine(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.workoutsService.planFromRoutineId(user.id, id);
  }

  /** Last session's actual sets for one exercise — the tracker's PREV column. */
  @Get('previous/:exerciseId')
  previous(@CurrentUser() user: User, @Param('exerciseId') exerciseId: string) {
    return this.workoutsService.previousSets(user.id, exerciseId);
  }

  // Sessions
  @Post('sessions')
  startSession(
    @CurrentUser() user: User,
    @Body() body: { workoutType: string; workoutPlanId?: number; plan?: unknown; routineId?: number },
  ) {
    // `routineId` is what makes a split rotate. It is *recorded* here and
    // stamped onto the routine when the session is finished — see
    // `completeSession`. Stamping it on start rotated the program for a
    // workout that was then discarded.
    return this.workoutsService.startSession(
      user.id,
      body.workoutType,
      body.workoutPlanId,
      body.plan,
      body.routineId,
    );
  }

  @Get('sessions')
  getSessions(@CurrentUser() user: User) {
    return this.workoutsService.getUserSessions(user.id);
  }

  @Get('sessions/history')
  getSessionHistory(@CurrentUser() user: User) {
    return this.workoutsService.getSessionHistory(user.id);
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

  /** One exercise's whole history, per session and per set (see the service). */
  @Get('progress/:exerciseId')
  exerciseProgress(@CurrentUser() user: User, @Param('exerciseId') exerciseId: string) {
    return this.workoutsService.exerciseProgress(user.id, exerciseId);
  }

  @Get('exercises/history')
  getExerciseHistory(@CurrentUser() user: User, @Query('name') name: string) {
    return this.workoutsService.getExerciseHistory(user.id, name);
  }

  @Patch('sessions/:id/complete')
  completeSession(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { notes?: string; caption?: string; tracked?: boolean; privacy?: string },
  ) {
    return this.workoutsService.completeSession(id, user.id, body.notes, {
      caption: body.caption,
      tracked: body.tracked,
      // Anything unrecognised falls back to the private option, never the
      // public one — a privacy field must fail closed.
      privacy: body.privacy && PRIVACY.includes(body.privacy) ? body.privacy : undefined,
    });
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
    @Body() body: {
      exerciseName: string;
      exerciseId?: string;
      setNumber: number;
      actualReps: number;
      weightKg: number;
      targetReps?: number;
      isWarmup?: boolean;
      rpe?: number;
    },
  ) {
    return this.workoutsService.logSet(
      sessionId, user.id, body.exerciseName, body.setNumber, body.actualReps, body.weightKg,
      body.targetReps, body.isWarmup, body.exerciseId, body.rpe,
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

  // Last session's actual numbers, shown as ghost values in the logging fields.
  @Get('last-values/:workoutType')
  getLastValues(@CurrentUser() user: User, @Param('workoutType') workoutType: string) {
    return this.workoutsService.getLastSessionValues(user.id, workoutType);
  }
}

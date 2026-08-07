import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, Public } from '../auth/decorators';
import { User } from '../users/user.entity';
import { CatalogService } from '../exercises/catalog.service';
import { RanksService } from './ranks.service';

interface CalculateDto {
  exerciseId: string;
  weightKg: number;
  reps: number;
  bodyweightKg: number;
  sex?: string;
  age?: number;
}

/** The Calculator's `Save Rank` toggle — record a lift done before the app existed. */
interface RecordDto {
  exerciseId: string;
  weightKg: number;
  reps: number;
}

@UseGuards(JwtAuthGuard)
@Controller('ranks')
export class RanksController {
  constructor(
    private ranks: RanksService,
    private catalog: CatalogService,
  ) {}

  /** Everything the Ranks tab renders — bodyrank, bodygraph and the exercise list. */
  @Get('me')
  me(@CurrentUser() user: User) {
    return this.ranks.overview(user.id);
  }

  @Get('exercises')
  exercises(@CurrentUser() user: User) {
    return this.ranks.exerciseRanks(user.id);
  }

  @Get('bodygraph')
  bodygraph(@CurrentUser() user: User) {
    return this.ranks.muscleRanks(user.id);
  }

  @Get('exercise/:id')
  exercise(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ranks.exerciseDetail(user.id, id);
  }

  @Get('leagues')
  leagues(@CurrentUser() user: User) {
    return this.ranks.leagues(user.id);
  }

  /**
   * Record a lift the user did outside the app, so the rank the Calculator just
   * showed them survives closing the screen. Ranks derive from `workout_sets`
   * and nothing else, so "saving a rank" can only mean logging the set.
   */
  @Post('record')
  async record(@CurrentUser() user: User, @Body() body: RecordDto) {
    const weightKg = Number(body.weightKg);
    const reps = Math.round(Number(body.reps));
    if (!(weightKg >= 0 && weightKg <= 1000) || !(reps >= 1 && reps <= 100)) {
      throw new BadRequestException('weightKg must be 0–1000 and reps 1–100');
    }
    await this.ranks.recordLift(user.id, body.exerciseId, weightKg, reps, 'Rank Calculator');
    return this.ranks.exerciseDetail(user.id, body.exerciseId);
  }

  /**
   * The standalone Rank Calculator, and the engine behind onboarding's first
   * rank. Public because step 21 of the funnel ranks a lift before the account
   * exists — it reads nothing and writes nothing.
   */
  @Public()
  @Post('calculate')
  calculate(@Body() body: CalculateDto) {
    const exercise = this.catalog.get(body.exerciseId);
    const scored = this.ranks.score(
      exercise,
      Number(body.weightKg),
      Number(body.reps),
      Number(body.bodyweightKg),
      body.sex ?? null,
      body.age ? Number(body.age) : null,
    );
    return { exercise: { id: exercise.id, name: exercise.name, primary: exercise.primary }, ...scored };
  }
}

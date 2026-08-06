import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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

import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  OnModuleInit,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, Public } from '../auth/decorators';
import { User } from '../users/user.entity';
import { HEALTH_METRICS, PROFILE_CARDS, ProfileService } from './profile.service';
import { __selfcheck as cosmeticsSelfCheck } from './cosmetics';
import { __selfcheck as xpSelfCheck } from './xp';
import { __selfcheck as windowsSelfCheck } from './profile.service';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController implements OnModuleInit {
  private readonly logger = new Logger(ProfileController.name);

  constructor(private profile: ProfileService) {}

  onModuleInit() {
    cosmeticsSelfCheck();
    xpSelfCheck();
    windowsSelfCheck();
    this.logger.log('ProfileService: cosmetics ok, xp ok, calendar windows ok');
  }

  /** Everything the Profile tab renders (SPEC §9), in one round trip. */
  @Get('me')
  me(@CurrentUser() user: User, @Query('window') window?: string) {
    return this.profile.overview(user.id, parseInt(window ?? '7', 10) || 7);
  }

  @Patch()
  update(@CurrentUser() user: User, @Body() body: Record<string, unknown>) {
    return this.profile.update(user.id, body as never);
  }

  /** The card list and the metric list, so the client never hardcodes them. */
  @Get('meta')
  meta() {
    return { cards: PROFILE_CARDS, metrics: HEALTH_METRICS };
  }

  @Get('statistics')
  statistics(@CurrentUser() user: User) {
    return this.profile.statistics(user.id);
  }

  /** Public: a profile link has to open for someone who is not signed in. */
  @Public()
  @Get('u/:username')
  publicProfile(@Param('username') username: string) {
    return this.profile.publicProfile(username);
  }

  // ── health ────────────────────────────────────────────────────────

  @Get('health')
  health(@CurrentUser() user: User, @Query('metric') metric: string) {
    return this.profile.healthLog(user.id, metric || 'bodyweight');
  }

  @Post('health')
  logHealth(
    @CurrentUser() user: User,
    @Body() body: { metric: string; value: number; date?: string },
  ) {
    return this.profile.logHealth(user.id, body?.metric, body?.value, body?.date);
  }

  @Delete('health/:metric/:id')
  deleteHealth(
    @CurrentUser() user: User,
    @Param('metric') metric: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profile.deleteHealth(user.id, metric, id);
  }

  // ── routines ──────────────────────────────────────────────────────

  @Get('routines')
  routines(@CurrentUser() user: User) {
    return this.profile.listRoutines(user.id);
  }

  @Post('routines')
  saveRoutine(@CurrentUser() user: User, @Body() body: never) {
    return this.profile.saveRoutine(user.id, body);
  }

  @Delete('routines/:id')
  deleteRoutine(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.profile.deleteRoutine(user.id, id);
  }

  @Post('folders')
  createFolder(@CurrentUser() user: User, @Body('name') name: string) {
    return this.profile.createFolder(user.id, name);
  }

  @Delete('folders/:id')
  deleteFolder(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.profile.deleteFolder(user.id, id);
  }

  // ── user-authored exercises ───────────────────────────────────────

  @Get('exercises')
  exercises(@CurrentUser() user: User) {
    return this.profile.listUserExercises(user.id);
  }

  @Post('exercises')
  createExercise(@CurrentUser() user: User, @Body() body: never) {
    return this.profile.createUserExercise(user.id, body);
  }

  @Delete('exercises/:id')
  deleteExercise(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.profile.deleteUserExercise(user.id, id);
  }

  // ── store ─────────────────────────────────────────────────────────

  @Get('store')
  store(@CurrentUser() user: User) {
    return this.profile.store(user.id);
  }

  @Post('store/buy')
  buy(@CurrentUser() user: User, @Body('id') id: string) {
    return this.profile.buy(user.id, id);
  }
}

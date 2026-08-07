import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  OnModuleInit,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import { User } from '../users/user.entity';
import {
  LEADERBOARD_METRICS,
  REACTIONS,
  SocialService,
  __selfcheck,
  type FeedScope,
  type LeaderboardMetric,
} from './social.service';

@UseGuards(JwtAuthGuard)
@Controller('social')
export class SocialController implements OnModuleInit {
  private readonly logger = new Logger(SocialController.name);

  constructor(
    private social: SocialService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    __selfcheck();
    this.logger.log('SocialService: handles ok');
  }

  // ── friends ───────────────────────────────────────────────────────

  @Get('friends')
  friends(@CurrentUser() user: User) {
    return this.social.friends(user.id);
  }

  @Get('search')
  search(@CurrentUser() user: User, @Query('q') q: string) {
    return this.social.search(user.id, q);
  }

  @Post('friends/:id')
  request(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.social.request(user.id, id);
  }

  @Post('friends/:id/accept')
  accept(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.social.respond(user.id, id, true);
  }

  @Post('friends/:id/decline')
  decline(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.social.respond(user.id, id, false);
  }

  @Delete('friends/:id')
  remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.social.remove(user.id, id);
  }

  // ── referrals ─────────────────────────────────────────────────────

  @Get('referral')
  referral(@CurrentUser() user: User) {
    const url = this.config.get('FRONTEND_URL') || 'https://dev-reprush.rezwoan.codes';
    return this.social.referral(user.id, url);
  }

  @Post('referral/claim')
  claim(@CurrentUser() user: User, @Body('code') code: string) {
    return this.social.claimReferral(user.id, code);
  }

  // ── feed ──────────────────────────────────────────────────────────

  @Get('feed')
  feed(
    @CurrentUser() user: User,
    @Query('scope') scope: string,
    @Query('before') before?: string,
  ) {
    const s: FeedScope = scope === 'discovery' ? 'discovery' : 'friends';
    return this.social.feed(user.id, s, before || undefined);
  }

  @Get('reactions')
  emojis() {
    return REACTIONS;
  }

  @Get('posts/:id')
  post(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.social.post(user.id, id);
  }

  @Post('posts/:id/react')
  react(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body('emoji') emoji: string | null,
  ) {
    return this.social.react(user.id, id, emoji ?? null);
  }

  @Get('posts/:id/comments')
  comments(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.social.comments(user.id, id);
  }

  @Post('posts/:id/comments')
  comment(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body('text') text: string,
  ) {
    return this.social.comment(user.id, id, text);
  }

  @Delete('comments/:id')
  deleteComment(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.social.deleteComment(user.id, id);
  }

  // ── leaderboards ──────────────────────────────────────────────────

  @Get('leaderboard')
  leaderboard(
    @CurrentUser() user: User,
    @Query('scope') scope: string,
    @Query('metric') metric: string,
  ) {
    const m = (LEADERBOARD_METRICS as readonly string[]).includes(metric)
      ? (metric as LeaderboardMetric)
      : 'bodyrank';
    return this.social.leaderboard(user.id, scope === 'global' ? 'global' : 'friends', m);
  }
}

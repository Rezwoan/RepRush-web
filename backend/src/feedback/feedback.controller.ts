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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import { User } from '../users/user.entity';
import { FEEDBACK_STATUSES, FEEDBACK_TOPICS } from './feedback.entity';
import { FeedbackService, type CreateFeedbackDto } from './feedback.service';
import { MAX_IMAGES, __selfcheck as attachmentsSelfCheck, contentTypeFor } from './attachment.store';

/**
 * `/api/feedback` — submit a report, read your own, triage everyone's as admin.
 *
 * Every route is authenticated. There is deliberately **no public submission
 * path**: an unauthenticated form is an open spam funnel that would write files
 * to the Pi's SD card, and everyone who can reach this screen is signed in
 * anyway.
 */
@UseGuards(JwtAuthGuard)
@Controller('feedback')
export class FeedbackController implements OnModuleInit {
  private readonly logger = new Logger(FeedbackController.name);

  constructor(private feedback: FeedbackService) {}

  /**
   * Boot self-check, beside every other one in the app.
   *
   * The path guard it asserts is security-relevant: a filename arrives from a
   * URL, and `../../.env` is a valid string. A failure takes the service down
   * on purpose — the alternative is a running server with a traversal hole.
   */
  onModuleInit() {
    attachmentsSelfCheck();
    this.logger.log('FeedbackService: attachments ok');
  }

  /**
   * The topic list and limits, so the client never hardcodes them.
   *
   * Same pattern as `GET /profile/meta`: one source for an enum that both sides
   * need. A client that hardcodes the list drifts the moment a topic is added.
   */
  @Get('meta')
  meta() {
    return { topics: FEEDBACK_TOPICS, statuses: FEEDBACK_STATUSES, maxImages: MAX_IMAGES };
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateFeedbackDto) {
    return this.feedback.create(user.id, body);
  }

  /** The reporter's own history — so submitting is not a shout into a void. */
  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.feedback.listMine(user.id);
  }

  /** Admin triage list. Guarded inside the service, not by a route decorator. */
  @Get('all')
  all(@CurrentUser() user: User) {
    return this.feedback.listAll(user);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    return this.feedback.setStatus(user, id, status);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.feedback.deleteReport(user, id);
  }

  /**
   * Stream one attachment.
   *
   * Authenticated and ownership-checked in the service, which is why the files
   * are not served statically: a static directory would make every screenshot
   * readable by anyone who guessed a filename.
   *
   * `private, max-age=3600` — the bytes never change once written (filenames
   * are random and unique), so a short private cache saves a round trip while
   * keeping it out of any shared cache.
   */
  @Get(':id/image/:filename')
  async image(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const buf = await this.feedback.readImage(user, id, filename);
    res.setHeader('Content-Type', contentTypeFor(filename));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buf);
  }
}

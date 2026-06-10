import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import { User } from '../users/user.entity';
import { PushService } from './push.service';

@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushController {
  constructor(private pushService: PushService) {}

  @Get('vapid')
  vapid() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Get('status')
  async status(@CurrentUser() user: User) {
    return { subscribed: await this.pushService.hasSubscription(user.id) };
  }

  @Post('subscribe')
  subscribe(@CurrentUser() user: User, @Body() body: { subscription: any }) {
    return this.pushService.subscribe(user.id, body.subscription);
  }

  @Post('unsubscribe')
  unsubscribe(@Body() body: { endpoint: string }) {
    return this.pushService.unsubscribe(body.endpoint);
  }

  @Post('test')
  test(@CurrentUser() user: User) {
    return this.pushService.sendTest(user.id);
  }
}

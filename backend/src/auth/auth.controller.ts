import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService, RegisterDto } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public, CurrentUser } from './decorators';
import { User } from '../users/user.entity';

/** Keep in step with JWT_EXPIRY (30d) so the cookie doesn't expire before the token. */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(body.email, body.password);
    // Set httpOnly cookie for session persistence
    res.cookie('reprush_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS,
    });
    return result;
  }

  /** Signup at the end of the onboarding funnel — carries the whole payload. */
  @Public()
  @Post('register')
  @HttpCode(201)
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(body);
    res.cookie('reprush_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS,
    });
    return result;
  }

  /**
   * Exchange a verified Clerk session for a RepRush session.
   *
   * Clerk owns the *proof of identity*; this app keeps owning the session,
   * because the outbox, the idempotency interceptor, the offline boot and every
   * guard already run on the RepRush JWT. Swapping that out would be a rewrite
   * of the offline story for no user-visible gain.
   *
   * Returns `{ needsSignup: true }` (200, not an error) when the verified email
   * matches no account — the frontend sends those people into `/welcome`.
   */
  @Public()
  @Post('clerk')
  @HttpCode(200)
  async clerk(
    @Body() body: { token: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithClerk(body?.token);
    if (!result.needsSignup) {
      res.cookie('reprush_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE_MS,
      });
    }
    return result;
  }

  /**
   * Which sign-in doors this deployment actually has. The frontend asks before
   * offering a Clerk button, so a server without Clerk keys shows the password
   * form alone rather than a button that 503s.
   */
  @Public()
  @Get('providers')
  providers() {
    return this.authService.providers();
  }

  @Public()
  @Post('activate')
  @HttpCode(200)
  async activate(
    @Body() body: { token: string; newPassword: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.activateAccount(body.token, body.newPassword);
    res.cookie('reprush_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS,
    });
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: User,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(user.id, body.oldPassword, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('reprush_token');
    return { message: 'Logged out' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: User) {
    return this.authService.me(user.id);
  }
}

import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import { UsersService } from './users.service';
import { User } from './user.entity';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: User) {
    const profile = await this.usersService.findById(user.id);
    const onboarding = await this.usersService.getOnboarding(user.id);
    const percent = await this.usersService.computeOnboardingPercent(user.id);
    const { passwordHash, inviteToken, ...safe } = profile;
    return { ...safe, onboarding, onboardingPercent: percent };
  }

  @Patch('profile')
  async updateProfile(@CurrentUser() user: User, @Body() body: any) {
    const allowed = ['name', 'heightCm', 'weightKg', 'creatineColor'];
    const updates: any = {};
    allowed.forEach((k) => {
      if (body[k] !== undefined) updates[k] = body[k];
    });

    const updated = await this.usersService.updateProfile(user.id, updates);

    if (body.heightCm || body.weightKg) {
      await this.usersService.updateOnboarding(user.id, { hasHeightWeight: true });
    }

    return updated;
  }

  @Post('profile/image')
  @UseInterceptors(FileInterceptor('image'))
  async uploadProfileImage(
    @CurrentUser() user: User,
    @UploadedFile() file: any,
    @Body() body: any,
  ) {
    let imageData = body.imageBase64 || null;
    if (file) {
      imageData = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    }
    if (!imageData) return { error: 'No image provided' };
    await this.usersService.updateProfile(user.id, { profileImage: imageData });
    await this.usersService.updateOnboarding(user.id, { hasProfileImage: true });
    return { message: 'Profile image updated' };
  }

  @Get('onboarding')
  async getOnboarding(@CurrentUser() user: User) {
    const ob = await this.usersService.getOnboarding(user.id);
    const percent = await this.usersService.computeOnboardingPercent(user.id);
    return { ...ob, percent };
  }

  @Patch('onboarding/dismiss')
  async dismissOnboarding(@CurrentUser() user: User) {
    return this.usersService.updateOnboarding(user.id, { dismissed: true });
  }
}

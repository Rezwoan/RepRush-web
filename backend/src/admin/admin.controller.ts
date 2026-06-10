import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/decorators';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/user.entity';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getAdminStats();
  }

  @Get('activity')
  getActivity() {
    return this.adminService.getActivity();
  }

  @Get('users')
  getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('users/:id')
  getUserDetail(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getUserDetail(id);
  }

  @Post('users/invite')
  inviteUser(@Body() body: { email: string; name: string }) {
    return this.adminService.inviteUser(body.email, body.name);
  }

  @Post('users/:id/resend-invite')
  resendInvite(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.resendInvite(id);
  }

  @Post('users/:id/reset-password')
  resetPassword(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.resetUserPassword(id);
  }

  @Delete('users/:id')
  deleteUser(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteUser(id);
  }

  @Get('compare')
  compare(@Query('users') users: string) {
    const ids = users.split(',').map((id) => parseInt(id));
    return this.adminService.getComparisonData(ids);
  }

  @Get('users/:id/report')
  getUserReport(
    @Param('id', ParseIntPipe) id: number,
    @Query('period') period: 'weekly' | 'monthly' = 'weekly',
  ) {
    return this.adminService.getUserReport(id, period);
  }

  @Post('users/:id/report/send')
  sendUserReport(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { period?: 'weekly' | 'monthly' },
  ) {
    return this.adminService.sendUserReport(id, body.period || 'weekly');
  }
}

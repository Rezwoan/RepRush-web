import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return null;
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    if (!user.isActivated) throw new UnauthorizedException('Account not yet activated. Check your invitation email.');

    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_EXPIRY') || '7d',
    });

    return { token, user: this.sanitize(user) };
  }

  async activateAccount(token: string, newPassword: string) {
    const user = await this.usersService.findByInviteToken(token);
    if (!user) throw new BadRequestException('Invalid or expired invitation token');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.usersService.activate(user.id, passwordHash);

    const payload = { sub: user.id, email: user.email, role: user.role };
    const jwtToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_EXPIRY') || '7d',
    });

    return { token: jwtToken, user: this.sanitize(user) };
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await this.usersService.findById(userId);
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) throw new BadRequestException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.usersService.updatePassword(userId, passwordHash);
    return { message: 'Password changed successfully' };
  }

  async me(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  private sanitize(user: User) {
    const { passwordHash, inviteToken, ...safe } = user;
    return safe;
  }
}

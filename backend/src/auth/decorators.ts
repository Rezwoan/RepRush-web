import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';
import { ROLES_KEY } from './roles.guard';
import { UserRole } from '../users/user.entity';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedSuperAdmin } from '../types/super-admin.type';

export const CurrentSuperAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedSuperAdmin => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as unknown as AuthenticatedSuperAdmin;
  },
);

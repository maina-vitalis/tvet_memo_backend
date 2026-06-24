import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { PlatformAdmin } from '../types/platform-admin.type';

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformAdmin => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as unknown as PlatformAdmin;
  },
);

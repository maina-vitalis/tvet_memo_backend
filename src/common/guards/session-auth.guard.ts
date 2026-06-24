import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SessionService } from '../../modules/auth/session.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const sessionAuth = request.session?.auth;

    if (!sessionAuth?.sessionId) {
      throw new UnauthorizedException('Authentication required');
    }

    const user = await this.sessionService.validateSession(sessionAuth.sessionId);

    if (!user) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    request.user = user;
    return true;
  }
}

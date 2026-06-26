import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/types/auth-user.type';
import { SessionService } from './session.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly sessionService: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: JwtPayload,
  ): Promise<AuthenticatedUser> {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    if (!token || !payload.jti) {
      throw new UnauthorizedException('Invalid token');
    }

    await this.sessionService.assertActive(payload.jti, token);

    return {
      id: payload.sub,
      sessionId: payload.jti,
      institutionId: payload.institutionId,
      roleId: payload.roleId,
      departmentId: payload.departmentId,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      mustChangePassword: payload.mustChangePassword,
    };
  }
}

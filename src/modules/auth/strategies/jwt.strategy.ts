import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { eq } from 'drizzle-orm';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DRIZZLE } from '../../../database/database.constants';
import { DrizzleDB } from '../../../database/drizzle';
import { users } from '../../../database/schema';
import { Role } from '../../../common/rbac/role.enum';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../../common/types/auth-user.type';
import { SessionService } from '../session.service';

/** [AUTH] Validates JWT and attaches unified user context to request.user. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly sessionService: SessionService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {
    super({
      // Mobile sends Authorization: Bearer <token>.
      // Web admin (via BFF) sends the token in an HttpOnly cookie set server-side.
      // The extractor chain tries Bearer first so mobile is never affected.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => req?.cookies?.['memo_access'] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: JwtPayload,
  ): Promise<AuthenticatedUser> {
    // Mirror the extractor priority: Bearer first, then HttpOnly cookie.
    const token =
      ExtractJwt.fromAuthHeaderAsBearerToken()(req) ??
      (req.cookies?.['memo_access'] as string | undefined) ??
      null;

    if (!token || !payload.jti) {
      throw new UnauthorizedException('Invalid token');
    }

    await this.sessionService.assertActive(payload.jti, token);

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User no longer active');
    }

    return {
      id: user.id,
      sessionId: payload.jti,
      role: user.role as Role,
      institutionId: user.institutionId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      departmentId: user.departmentId,
      cohortId: user.cohortId,
      mustChangePassword: user.mustChangePassword,
    };
  }
}

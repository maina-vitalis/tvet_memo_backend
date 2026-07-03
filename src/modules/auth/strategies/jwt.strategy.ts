import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { eq } from 'drizzle-orm';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DRIZZLE } from '../../../database/database.constants';
import { DrizzleDB } from '../../../database/drizzle';
import { permissions, rolePermissions } from '../../../database/schema';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../../common/types/auth-user.type';
import { SessionService } from '../session.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly sessionService: SessionService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
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

    // Uses redis-cached session (with DB fallback) to verify not revoked/expired
    await this.sessionService.assertActive(payload.jti, token, 'user');

    // [RBAC] Load the user's current permissions from the permissions table.
    // This is the authoritative source. Short-lived tokens mean this stays fresh.
    const userPermissions = await this.db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, payload.roleId));

    const permissionKeys = userPermissions.map((p) => p.key);

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
      permissions: permissionKeys,
    };
  }
}

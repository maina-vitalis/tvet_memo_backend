import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { and, eq } from 'drizzle-orm';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DRIZZLE } from '../../../database/database.constants';
import { DrizzleDB } from '../../../database/drizzle';
import { superAdmins } from '../../../database/schema';
import {
  AuthenticatedSuperAdmin,
  SuperAdminJwtPayload,
} from '../../../common/types/super-admin.type';
import { SessionService } from '../../auth/session.service';

function isSuperAdminJwtPayload(
  payload: unknown,
): payload is SuperAdminJwtPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const candidate = payload as SuperAdminJwtPayload;
  return (
    typeof candidate.sub === 'string' &&
    typeof candidate.jti === 'string' &&
    candidate.type === 'super-admin' &&
    typeof candidate.email === 'string'
  );
}

@Injectable()
export class SuperAdminJwtStrategy extends PassportStrategy<
  typeof Strategy,
  AuthenticatedSuperAdmin
>(Strategy, 'super-admin-jwt') {
  constructor(
    configService: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly sessionService: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), //TODO : Change to cookie extraction if needed
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: unknown,
  ): Promise<AuthenticatedSuperAdmin> {
    if (!isSuperAdminJwtPayload(payload)) {
      throw new UnauthorizedException('Invalid super admin token');
    }

    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (!token) {
      throw new UnauthorizedException('Invalid super admin token');
    }

    //check if the session is active
    await this.sessionService.assertActive(payload.jti, token, 'super_admin');

    const [superAdmin] = await this.db
      .select({
        id: superAdmins.id,
        email: superAdmins.email,
      })
      .from(superAdmins)
      .where(
        and(eq(superAdmins.id, payload.sub), eq(superAdmins.isActive, true)),
      )
      .limit(1);

    if (!superAdmin) {
      throw new UnauthorizedException('Super admin account not found');
    }

    return {
      id: superAdmin.id,
      sessionId: payload.jti,
      email: superAdmin.email,
    };
  }
}

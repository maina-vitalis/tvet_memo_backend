import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { and, eq } from 'drizzle-orm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { superAdmins } from '../../database/schema';
import {
  AuthenticatedSuperAdmin,
  SuperAdminJwtPayload,
} from '../../common/types/super-admin.type';

@Injectable()
export class SuperAdminJwtStrategy extends PassportStrategy(
  Strategy,
  'super-admin-jwt',
) {
  constructor(
    configService: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  async validate(
    payload: SuperAdminJwtPayload,
  ): Promise<AuthenticatedSuperAdmin> {
    if (payload.type !== 'super-admin' || !payload.sub) {
      throw new UnauthorizedException('Invalid super admin token');
    }

    const [superAdmin] = await this.db
      .select({
        id: superAdmins.id,
        email: superAdmins.email,
        isActive: superAdmins.isActive,
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
      email: superAdmin.email,
    };
  }
}

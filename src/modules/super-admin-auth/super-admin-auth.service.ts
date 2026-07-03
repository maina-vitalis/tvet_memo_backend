import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import { Request } from 'express';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { superAdmins } from '../../database/schema';
import { SuperAdminJwtPayload } from '../../common/types/super-admin.type';
import {
  generateSessionId,
  sanitizeUser,
} from '../../common/utils/crypto.util';

/**
 * [REFRESH TOKENS] Super admin path also now issues refresh tokens.
 * We keep the same patterns for simplicity and consistent client code.
 */
import { SessionService } from '../auth/session.service';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';

@Injectable()
export class SuperAdminAuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
  ) {}

  async login(dto: SuperAdminLoginDto, req: Request) {
    const [superAdmin] = await this.db
      .select()
      .from(superAdmins)
      .where(
        and(
          eq(superAdmins.email, dto.email.toLowerCase()),
          eq(superAdmins.isActive, true),
        ),
      )
      .limit(1);

    if (!superAdmin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(
      superAdmin.passwordHash,
      dto.password,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.db
      .update(superAdmins)
      .set({ lastLoginAt: new Date() })
      .where(eq(superAdmins.id, superAdmin.id));

    const expiresIn = this.configService.get<string>('jwt.expiresIn', '7d');
    const sessionId = generateSessionId();

    const payload: SuperAdminJwtPayload = {
      sub: superAdmin.id,
      jti: sessionId,
      type: 'super-admin',
      email: superAdmin.email,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    // [REFRESH TOKENS] Use new persist method that also creates the refresh token
    const { refreshToken } =
      await this.sessionService.persistSessionAfterSigning({
        sessionId,
        actorType: 'super_admin',
        superAdminId: superAdmin.id,
        accessToken,
        deviceId: dto.deviceId,
        deviceName: dto.deviceName,
        deviceType: dto.deviceType ?? 'web',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });

    const accessExpiresIn = this.sessionService.getExpiresInSeconds(
      this.configService.get<string>('jwt.accessExpiresIn', '15m'),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer' as const,
      expiresIn: accessExpiresIn,
      superAdmin: sanitizeUser(superAdmin),
    };
  }

  async logout(sessionId: string) {
    await this.sessionService.revoke(sessionId);

    return { message: 'Logged out successfully' };
  }
}

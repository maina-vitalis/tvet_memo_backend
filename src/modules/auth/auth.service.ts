import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import { Request } from 'express';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { institutions, users } from '../../database/schema';
import {
  sanitizeUser,
  generateSessionId,
} from '../../common/utils/crypto.util';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/types/auth-user.type';
import { AuditService } from '../audit/audit.service';
import { InstitutionsService } from '../institutions/institutions.service';
import { LoginDto } from './dto/login.dto';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly sessionService: SessionService,
    private readonly institutionsService: InstitutionsService,
  ) {}

  async login(dto: LoginDto, req: Request) {
    const [institution] = await this.db
      .select()
      .from(institutions)
      .where(
        and(
          eq(institutions.subdomain, dto.subdomain),
          eq(institutions.isActive, true),
        ),
      )
      .limit(1);

    if (!institution) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.institutionId, institution.id),
          eq(users.email, dto.email.toLowerCase()),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const setupPending = await this.institutionsService.hasPendingSetup(
      user.id,
    );
    if (setupPending) {
      throw new UnauthorizedException(
        'Account setup is pending. Please use the setup link sent to your email.',
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const expiresIn = this.configService.get<string>('jwt.expiresIn', '7d');
    const sessionId = generateSessionId();

    const payload: JwtPayload = {
      sub: user.id,
      jti: sessionId,
      institutionId: institution.id,
      roleId: user.roleId,
      departmentId: user.departmentId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      mustChangePassword: user.mustChangePassword,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    await this.sessionService.create({
      sessionId,
      userId: user.id,
      token: accessToken,
      deviceName: dto.deviceName,
      deviceType: dto.deviceType ?? 'web',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    await this.auditService.log({
      institutionId: institution.id,
      actorId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn,
      user: sanitizeUser(user),
      institution: {
        id: institution.id,
        name: institution.name,
        subdomain: institution.subdomain,
      },
      mustChangePassword: user.mustChangePassword,
    };
  }

  async logout(user: AuthenticatedUser, req: Request) {
    await this.sessionService.revoke(user.sessionId);

    await this.auditService.log({
      institutionId: user.institutionId,
      actorId: user.id,
      action: 'session.revoke',
      entityType: 'session',
      entityId: user.sessionId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    return { message: 'Logged out successfully' };
  }

  async getProfile(userId: string, institutionId: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.institutionId, institutionId),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return sanitizeUser(user);
  }

  async changePassword(
    userId: string,
    institutionId: string,
    currentPassword: string,
    newPassword: string,
    req: Request,
  ) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.institutionId, institutionId)))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    await this.db
      .update(users)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(users.id, userId));

    await this.auditService.log({
      institutionId,
      actorId: userId,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: userId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    return { message: 'Password updated successfully' };
  }
}

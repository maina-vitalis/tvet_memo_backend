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
import { extractEmailDomain } from '../../common/utils/email.util';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { institutions, otps, users } from '../../database/schema';
import {
  generateOtp,
  generateSessionId,
  sanitizeUser,
} from '../../common/utils/crypto.util';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/types/auth-user.type';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import {
  EmailLoginDto,
  InitiateEmailLoginDto,
  RegistryLoginDto,
} from './dto/login.dto';
import { InstitutionsService } from '../institutions/institutions.service';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly sessionService: SessionService,
    private readonly emailService: EmailService,
    private readonly institutionsService: InstitutionsService,
  ) {}

  // Email flow - Step 1: send OTP after institution discovery
  async initiateEmailLogin(dto: InitiateEmailLoginDto) {
    const email = dto.email.toLowerCase();
    const domain = extractEmailDomain(email);

    const [institution] = await this.db
      .select({
        id: institutions.id,
        name: institutions.name,
        subdomain: institutions.subdomain,
        isActive: institutions.isActive,
      })
      .from(institutions)
      .where(eq(institutions.id, dto.institutionId))
      .limit(1);

    if (
      !institution ||
      !institution.isActive ||
      !domain ||
      institution.subdomain.toLowerCase() !== domain
    ) {
      return { message: 'If this email exists, an OTP has been sent' };
    }

    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.institutionId, dto.institutionId),
          eq(users.email, email),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    if (!user) {
      return { message: 'If this email exists, an OTP has been sent' };
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    try {
      await this.emailService.sendVerificationCode(
        email,
        code,
        institution.name,
      );
    } catch {
      return { message: 'If this email exists, an OTP has been sent' };
    }

    await this.db.insert(otps).values({
      institutionId: dto.institutionId,
      email,
      code,
      expiresAt,
    });

    return { message: 'If this email exists, an OTP has been sent' };
  }

  // Email flow - Step 2: verify OTP and sign in
  async emailLogin(dto: EmailLoginDto, req: Request) {
    const email = dto.email.toLowerCase();
    const now = new Date();

    const [institution] = await this.db
      .select({ id: institutions.id, isActive: institutions.isActive })
      .from(institutions)
      .where(eq(institutions.id, dto.institutionId))
      .limit(1);

    if (!institution || !institution.isActive) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const [otp] = await this.db
      .select()
      .from(otps)
      .where(
        and(
          eq(otps.institutionId, dto.institutionId),
          eq(otps.email, email),
          eq(otps.code, dto.otp),
          eq(otps.used, false),
        ),
      )
      .limit(1);

    if (!otp || otp.expiresAt < now) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.db.update(otps).set({ used: true }).where(eq(otps.id, otp.id));

    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.institutionId, dto.institutionId),
          eq(users.email, email),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    return this.createSession(user, dto.institutionId, dto, req);
  }

  // Shortcode flow: sign in with admission number + password (institution already discovered)
  async registryLogin(dto: RegistryLoginDto, req: Request) {
    const [institution] = await this.db
      .select({ id: institutions.id })
      .from(institutions)
      .where(
        and(
          eq(institutions.id, dto.institutionId),
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
          eq(users.institutionId, dto.institutionId),
          eq(users.admissionNumber, dto.admissionNumber),
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

    return this.createSession(user, dto.institutionId, dto, req);
  }

  private async createSession(
    user: typeof users.$inferSelect,
    institutionId: string,
    dto: { deviceName?: string; deviceType?: string },
    req: Request,
  ) {
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const expiresIn = this.configService.get<string>('jwt.expiresIn', '7d');
    const sessionId = generateSessionId();

    const payload: JwtPayload = {
      sub: user.id,
      jti: sessionId,
      institutionId,
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
      institutionId,
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

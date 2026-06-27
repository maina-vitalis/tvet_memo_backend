import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { Request } from 'express';
import { hasAdminPortalAccess } from '../../common/utils/admin-rights.util';
import { extractEmailDomain } from '../../common/utils/email.util';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import {
  accountSetupTokens,
  institutions,
  otps,
  roles,
  users,
} from '../../database/schema';
import {
  generateOtp,
  generateSessionId,
  hashToken,
  sanitizeUser,
} from '../../common/utils/crypto.util';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/types/auth-user.type';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import {
  AdminLoginDto,
  CompleteAccountSetupDto,
  VerifySetupTokenDto,
} from './dto/admin-auth.dto';
import {
  CheckEmailLoginDto,
  CompleteEmailSetupDto,
  EmailLoginDto,
  EmailPasswordLoginDto,
  InitiateEmailLoginDto,
  RegistryLoginDto,
  ValidateEmailOtpDto,
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

  async checkEmailLogin(dto: CheckEmailLoginDto) {
    const email = dto.email.toLowerCase();
    const domain = extractEmailDomain(email);

    const [institution] = await this.db
      .select({
        id: institutions.id,
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
      return { message: 'If this email exists, you can continue' };
    }

    const [user] = await this.db
      .select({
        id: users.id,
        mustChangePassword: users.mustChangePassword,
      })
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
      return { message: 'If this email exists, you can continue' };
    }

    const setupPending = await this.institutionsService.hasPendingSetup(
      user.id,
    );

    return {
      isFirstSetup: user.mustChangePassword || setupPending,
    };
  }

  async validateEmailOtp(dto: ValidateEmailOtpDto) {
    const otp = await this.findValidEmailOtp(
      dto.institutionId,
      dto.email,
      dto.otp,
    );

    if (!otp) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const [user] = await this.db
      .select({
        id: users.id,
        mustChangePassword: users.mustChangePassword,
      })
      .from(users)
      .where(
        and(
          eq(users.institutionId, dto.institutionId),
          eq(users.email, dto.email.toLowerCase()),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const setupPending = await this.institutionsService.hasPendingSetup(
      user.id,
    );

    return {
      verified: true,
      isFirstSetup: user.mustChangePassword || setupPending,
    };
  }

  async emailPasswordLogin(dto: EmailPasswordLoginDto, req: Request) {
    const email = dto.email.toLowerCase();

    const [institution] = await this.db
      .select({ id: institutions.id, isActive: institutions.isActive })
      .from(institutions)
      .where(eq(institutions.id, dto.institutionId))
      .limit(1);

    if (!institution || !institution.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

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
      throw new UnauthorizedException('Invalid credentials');
    }

    const setupPending = await this.institutionsService.hasPendingSetup(
      user.id,
    );

    if (user.mustChangePassword || setupPending) {
      throw new UnauthorizedException(
        'Account setup is incomplete. Please verify your email first.',
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createSession(user, dto.institutionId, dto, req);
  }

  async completeEmailSetup(dto: CompleteEmailSetupDto, req: Request) {
    const email = dto.email.toLowerCase();
    const otp = await this.findValidEmailOtp(
      dto.institutionId,
      email,
      dto.otp,
    );

    if (!otp) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

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

    const setupPending = await this.institutionsService.hasPendingSetup(
      user.id,
    );

    if (!user.mustChangePassword && !setupPending) {
      throw new BadRequestException('Account setup is already complete');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const [updatedUser] = await this.db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
      })
      .where(eq(users.id, user.id))
      .returning();

    await this.db.update(otps).set({ used: true }).where(eq(otps.id, otp.id));

    const session = await this.createSession(
      updatedUser,
      dto.institutionId,
      dto,
      req,
    );

    await this.auditService.log({
      institutionId: dto.institutionId,
      actorId: updatedUser.id,
      action: 'user.account_setup_completed',
      entityType: 'user',
      entityId: updatedUser.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    return session;
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

  async adminLogin(dto: AdminLoginDto, req: Request) {
    const subdomain = dto.subdomain.trim().toLowerCase();
    const email = dto.email.toLowerCase();

    const institution =
      await this.institutionsService.findBySubdomain(subdomain);

    const [record] = await this.db
      .select({
        user: users,
        role: roles,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(
        and(
          eq(users.institutionId, institution.id),
          eq(users.email, email),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    if (
      !record ||
      !hasAdminPortalAccess(
        record.role.adminRights as Record<string, unknown> | null,
      )
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const setupPending = await this.institutionsService.hasPendingSetup(
      record.user.id,
    );
    if (setupPending) {
      throw new UnauthorizedException(
        'Account setup is pending. Please use the setup link sent to your email.',
      );
    }

    const passwordValid = await argon2.verify(
      record.user.passwordHash,
      dto.password,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.createSession(
      record.user,
      institution.id,
      dto,
      req,
    );

    return {
      ...session,
      institution: {
        id: institution.id,
        name: institution.name,
        subdomain: institution.subdomain,
      },
    };
  }

  async verifySetupToken(dto: VerifySetupTokenDto) {
    const record = await this.findValidSetupToken(dto.token);

    if (!record) {
      throw new BadRequestException('Invalid or expired setup link');
    }

    return {
      institutionName: record.institution.name,
      subdomain: record.institution.subdomain,
      adminEmail: record.user.email,
      adminName: `${record.user.firstName} ${record.user.lastName}`,
      expiresAt: record.token.expiresAt.toISOString(),
    };
  }

  async completeAccountSetup(dto: CompleteAccountSetupDto, req: Request) {
    const record = await this.findValidSetupToken(dto.token);

    if (!record) {
      throw new BadRequestException('Invalid or expired setup link');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const [updatedUser] = await this.db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
      })
      .where(eq(users.id, record.user.id))
      .returning();

    await this.db
      .update(accountSetupTokens)
      .set({ usedAt: new Date() })
      .where(eq(accountSetupTokens.id, record.token.id));

    const session = await this.createSession(
      updatedUser,
      record.institution.id,
      dto,
      req,
    );

    await this.auditService.log({
      institutionId: record.institution.id,
      actorId: updatedUser.id,
      action: 'user.account_setup_completed',
      entityType: 'user',
      entityId: updatedUser.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    return {
      ...session,
      institution: {
        id: record.institution.id,
        name: record.institution.name,
        subdomain: record.institution.subdomain,
      },
    };
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

  private async findValidEmailOtp(
    institutionId: string,
    email: string,
    code: string,
  ) {
    const now = new Date();

    const [otp] = await this.db
      .select()
      .from(otps)
      .where(
        and(
          eq(otps.institutionId, institutionId),
          eq(otps.email, email.toLowerCase()),
          eq(otps.code, code),
          eq(otps.used, false),
        ),
      )
      .limit(1);

    if (!otp || otp.expiresAt < now) {
      return null;
    }

    return otp;
  }

  private async findValidSetupToken(token: string) {
    const tokenHash = hashToken(token);
    const now = new Date();

    const [record] = await this.db
      .select({
        token: accountSetupTokens,
        user: users,
        institution: institutions,
      })
      .from(accountSetupTokens)
      .innerJoin(users, eq(accountSetupTokens.userId, users.id))
      .innerJoin(
        institutions,
        eq(accountSetupTokens.institutionId, institutions.id),
      )
      .where(
        and(
          eq(accountSetupTokens.tokenHash, tokenHash),
          isNull(accountSetupTokens.usedAt),
        ),
      )
      .limit(1);

    if (!record || record.token.expiresAt < now) {
      return null;
    }

    return record;
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
      actorType: 'user',
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

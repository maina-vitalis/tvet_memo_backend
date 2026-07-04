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
import { Role } from '../../common/rbac/role.enum';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import {
  accountSetupTokens,
  institutions,
  otps,
  users,
} from '../../database/schema';
import {
  generateOtp,
  generateSessionId,
  hashToken,
  sanitizeUser,
} from '../../common/utils/crypto.util';

/**
 * [REFRESH TOKENS] NOTE ON FLOW:
 * - All login/setup paths now go through a two-phase approach:
 *   1. Build JWT payload + sign access token (short lived)
 *   2. Call sessionService.persistSessionAfterSigning(...) to store access hash + generate+store refresh
 * - This gives us clean rotation semantics later.
 * - The returned object now always includes `refreshToken`.
 */
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/types/auth-user.type';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import {
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
  UnifiedLoginDto,
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

    const [institution] = await this.db
      .select({
        id: institutions.id,
        name: institutions.name,
        isActive: institutions.isActive,
      })
      .from(institutions)
      .where(eq(institutions.id, dto.institutionId))
      .limit(1);

    if (!institution || !institution.isActive) {
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

    const [institution] = await this.db
      .select({
        id: institutions.id,
        isActive: institutions.isActive,
      })
      .from(institutions)
      .where(eq(institutions.id, dto.institutionId))
      .limit(1);

    if (!institution || !institution.isActive) {
      return { exists: false, isFirstSetup: false };
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
      return { exists: false, isFirstSetup: false };
    }

    const setupPending = await this.institutionsService.hasPendingSetup(
      user.id,
    );

    return {
      exists: true,
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

    return this.createSession(user, dto, req);
  }

  async completeEmailSetup(dto: CompleteEmailSetupDto, req: Request) {
    const email = dto.email.toLowerCase();
    const otp = await this.findValidEmailOtp(dto.institutionId, email, dto.otp);

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

    const session = await this.createSession(updatedUser, dto, req);

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

    return this.createSession(user, dto, req);
  }

  /** [AUTH] Unified login for all roles — branches only on totpEnabled. */
  async login(dto: UnifiedLoginDto, req: Request) {
    const email = dto.email.toLowerCase();

    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.isActive, true)))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.totpEnabled) {
      return { requiresTotp: true, userId: user.id };
    }

    if (user.role !== Role.SUPER_ADMIN) {
      const setupPending = await this.institutionsService.hasPendingSetup(
        user.id,
      );
      if (user.mustChangePassword || setupPending) {
        throw new UnauthorizedException(
          'Account setup is pending. Please use the setup link sent to your email.',
        );
      }
    }

    const session = await this.createSession(user, dto, req);

    if (user.institutionId) {
      const [institution] = await this.db
        .select({
          id: institutions.id,
          name: institutions.name,
          subdomain: institutions.subdomain,
        })
        .from(institutions)
        .where(eq(institutions.id, user.institutionId))
        .limit(1);

      return {
        ...session,
        institution: institution ?? null,
      };
    }

    return session;
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

  //complete the account setup for the admin user after verifying the setup token
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

    const session = await this.createSession(updatedUser, dto, req);

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

    return this.createSession(user, dto, req);
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

  /**
   * [REFRESH TOKENS - CORE]
   * Issues short-lived access + long-lived refresh for a regular user.
   * - Access expiry: config jwt.accessExpiresIn (default 15m)
   * - Refresh expiry: config jwt.refreshExpiresIn (default 7d)
   * - Refresh token is rotated on future use and revoked on logout.
   *
   * Documentation for reviewer:
   * - deviceId (if passed from client in future) enables precise device management.
   * - expiresIn is now returned as **number of seconds** (clients expect this for timers).
   */
  private async createSession(
    user: typeof users.$inferSelect,
    dto: {
      deviceName?: string;
      deviceType?: string;
      deviceId?: string;
    },
    req: Request,
  ) {
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const sessionId = generateSessionId();

    const payload: JwtPayload = {
      sub: user.id,
      jti: sessionId,
      role: user.role as Role,
      institutionId: user.institutionId,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const { refreshToken } = await this.sessionService.persistSessionAfterSigning({
      sessionId,
      userId: user.id,
      accessToken,
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
      deviceType: dto.deviceType ?? 'web',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    if (user.institutionId) {
      await this.auditService.log({
        institutionId: user.institutionId,
        actorId: user.id,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
    }

    const accessExpiresIn = this.sessionService.getExpiresInSeconds(
      this.configService.get<string>('jwt.accessExpiresIn', '15m'),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer' as const,
      expiresIn: accessExpiresIn,
      user: sanitizeUser(user),
      mustChangePassword: user.mustChangePassword,
    };
  }

  /**
   * [REFRESH TOKENS] Logout.
   * Prefers the authenticated session, but can also revoke using a provided refresh token.
   * This allows clients to logout even if their access token is already expired.
   */
  async logout(
    user: AuthenticatedUser | undefined,
    req: Request,
    refreshToken?: string,
  ) {
    if (user?.sessionId) {
      await this.sessionService.revoke(user.sessionId);

      if (user.institutionId) {
        await this.auditService.log({
          institutionId: user.institutionId,
          actorId: user.id,
          action: 'session.revoke',
          entityType: 'session',
          entityId: user.sessionId,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
        });
      }
    } else if (refreshToken) {
      await this.sessionService.revokeByRefreshToken(refreshToken);
      // Light audit - we may not know the actor
      // In production you might want to look up the user first for better audit.
    }

    return { message: 'Logged out successfully' };
  }

  /**
   * [SIGN OUT ALL + ACTIVE SESSIONS]
   * Returns the user's active sessions with a flag indicating which one is the current request.
   * Keeps the response lightweight and safe (no secret material).
   */
  async getActiveSessions(user: AuthenticatedUser) {
    const sessions = await this.sessionService.findActiveSessionsForUser(user.id);

    return sessions.map((s) => ({
      ...s,
      current: s.id === user.sessionId,
      // [SECURITY] Lightweight privacy: mask the last part of the IP
      ipAddress: this.maskIp(s.ipAddress),
    }));
  }

  /**
   * [SIGN OUT ALL]
   * Revokes every active session for this user.
   * After this, the client must clear tokens and the user will be logged out everywhere.
   */
  async logoutAll(user: AuthenticatedUser, req: Request) {
    const count = await this.sessionService.revokeAllForUser(user.id);

    if (user.institutionId) {
      await this.auditService.log({
        institutionId: user.institutionId,
        actorId: user.id,
        action: 'session.revoke_all',
        entityType: 'session',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        afterState: { revokedCount: count },
      });
    }

    return { message: 'Signed out from all devices', revokedCount: count };
  }

  /**
   * Revoke one specific session/device.
   * Security: ensure the session belongs to the caller.
   */
  async logoutSpecificSession(user: AuthenticatedUser, sessionId: string, req: Request) {
    // We fetch to verify ownership (lightweight)
    const active = await this.sessionService.findActiveSessionsForUser(user.id);
    const target = active.find((s) => s.id === sessionId);

    if (!target) {
      // Either doesn't exist, already revoked, or not owned by user
      return { message: 'Session not found or already signed out' };
    }

    await this.sessionService.revoke(sessionId);

    if (user.institutionId) {
      await this.auditService.log({
        institutionId: user.institutionId,
        actorId: user.id,
        action: 'session.revoke',
        entityType: 'session',
        entityId: sessionId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
    }

    return { message: 'Device signed out successfully' };
  }

  private maskIp(ip: any): string | null {
    if (!ip) return null;
    const str = String(ip);
    // Very simple masking for display (last segment hidden)
    return str.includes('.') ? str.replace(/\.\d+$/, '.xxx') : str;
  }

  async getProfile(userId: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return sanitizeUser(user);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    req: Request,
  ) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
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

    if (user.institutionId) {
      await this.auditService.log({
        institutionId: user.institutionId,
        actorId: userId,
        action: 'user.password_reset',
        entityType: 'user',
        entityId: userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
    }

    return { message: 'Password updated successfully' };
  }

  /** [AUTH] Refresh access token using a valid refresh token (all roles). */
  async refreshTokens(
    refreshToken: string,
    req: Request,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
  }> {
    const rotation = await this.sessionService.rotateAndIssueNewAccess({
      refreshToken,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, rotation.userId))
      .limit(1);

    if (!user || !user.isActive) {
      await this.sessionService.revoke(rotation.newSessionId);
      throw new UnauthorizedException('User no longer active');
    }

    const payload: JwtPayload = {
      sub: user.id,
      jti: rotation.newSessionId,
      role: user.role as Role,
      institutionId: user.institutionId,
    };

    const newAccessToken = await this.jwtService.signAsync(payload);

    await this.sessionService.updateAccessTokenAfterRefresh({
      sessionId: rotation.newSessionId,
      newAccessToken,
    });

    const accessExpiresIn = this.sessionService.getExpiresInSeconds(
      this.configService.get<string>('jwt.accessExpiresIn', '15m'),
    );

    if (user.institutionId) {
      await this.auditService.log({
        institutionId: user.institutionId,
        actorId: user.id,
        action: 'auth.refresh',
        entityType: 'session',
        entityId: rotation.newSessionId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
    }

    return {
      accessToken: newAccessToken,
      refreshToken: rotation.newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: accessExpiresIn,
    };
  }
}

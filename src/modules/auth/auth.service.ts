import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import { Request } from 'express';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { institutions, users } from '../../database/schema';
import { sanitizeUser } from '../../common/utils/crypto.util';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly sessionService: SessionService,
    private readonly auditService: AuditService,
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

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { sessionId } = await this.sessionService.create({
      userId: user.id,
      deviceName: dto.deviceName,
      deviceType: dto.deviceType ?? 'web',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    req.session.auth = {
      sessionId,
      userId: user.id,
      institutionId: institution.id,
    };

    return {
      user: sanitizeUser(user),
      institution: {
        id: institution.id,
        name: institution.name,
        subdomain: institution.subdomain,
      },
      mustChangePassword: user.mustChangePassword,
    };
  }

  async logout(req: Request) {
    const sessionId = req.session?.auth?.sessionId;
    if (sessionId) {
      await this.sessionService.revoke(sessionId);
      await this.auditService.log({
        institutionId: req.session.auth!.institutionId,
        actorId: req.session.auth!.userId,
        action: 'session.revoke',
        entityType: 'session',
        entityId: sessionId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
    }

    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
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

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });

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

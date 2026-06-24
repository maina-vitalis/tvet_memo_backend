import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { sessions, users } from '../../database/schema';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { generateSessionToken, hashToken } from '../../common/utils/crypto.util';

export interface CreateSessionInput {
  userId: string;
  deviceName?: string;
  deviceType?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
  ) {}

  async create(input: CreateSessionInput): Promise<{ sessionId: string; token: string }> {
    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const maxAgeMs = this.configService.get<number>('session.maxAgeMs', 604800000);
    const expiresAt = new Date(Date.now() + maxAgeMs);

    const [session] = await this.db
      .insert(sessions)
      .values({
        userId: input.userId,
        tokenHash,
        deviceName: input.deviceName,
        deviceType: input.deviceType,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        expiresAt,
      })
      .returning({ id: sessions.id });

    return { sessionId: session.id, token };
  }

  async validateSession(sessionId: string): Promise<AuthenticatedUser | null> {
    const now = new Date();

    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        institutionId: users.institutionId,
        roleId: users.roleId,
        departmentId: users.departmentId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        mustChangePassword: users.mustChangePassword,
        isActive: users.isActive,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.isActive, true),
          gt(sessions.expiresAt, now),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.userId,
      institutionId: row.institutionId,
      roleId: row.roleId,
      departmentId: row.departmentId,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      mustChangePassword: row.mustChangePassword,
      sessionId: row.sessionId,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ isActive: false })
      .where(eq(sessions.id, sessionId));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ isActive: false })
      .where(and(eq(sessions.userId, userId), eq(sessions.isActive, true)));
  }
}

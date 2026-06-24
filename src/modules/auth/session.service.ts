import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { sessions } from '../../database/schema';
import { hashToken } from '../../common/utils/crypto.util';

export interface CreateSessionInput {
  sessionId: string;
  userId: string;
  token: string;
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

  async create(input: CreateSessionInput): Promise<string> {
    const expiresIn = this.configService.get<string>('jwt.expiresIn', '7d');
    const expiresAt = this.resolveExpiry(expiresIn);

    const [session] = await this.db
      .insert(sessions)
      .values({
        id: input.sessionId,
        userId: input.userId,
        tokenHash: hashToken(input.token),
        deviceName: input.deviceName,
        deviceType: input.deviceType,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        expiresAt,
      })
      .returning({ id: sessions.id });

    return session.id;
  }

  async assertActive(sessionId: string, token: string): Promise<void> {
    const now = new Date();

    const [session] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.tokenHash, hashToken(token)),
          eq(sessions.isActive, true),
          gt(sessions.expiresAt, now),
        ),
      )
      .limit(1);

    if (!session) {
      throw new UnauthorizedException('Session expired or revoked');
    }
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ isActive: false })
      .where(eq(sessions.id, sessionId));
  }

  private resolveExpiry(expiresIn: string): Date {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multipliers[unit]);
  }
}

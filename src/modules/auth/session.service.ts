import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gt } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { sessions, Session } from '../../database/schema';
import {
  generateRefreshToken,
  hashToken,
} from '../../common/utils/crypto.util';
import { RedisService } from '../../common/redis/redis.service';

/** [AUTH] Issues, validates, rotates, and revokes access + refresh token pairs. */
interface PersistSessionInput {
  sessionId: string;
  userId: string;
  accessToken: string;
  deviceId?: string;
  deviceName?: string;
  deviceType?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RefreshTokenInput {
  refreshToken: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async persistSessionAfterSigning(
    params: PersistSessionInput,
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const accessExpiresAt = this.resolveExpiry(
      this.configService.get<string>('jwt.accessExpiresIn', '15m'),
    );
    const refreshExpiresAt = this.resolveExpiry(
      this.configService.get<string>('jwt.refreshExpiresIn', '7d'),
    );

    const refreshToken = generateRefreshToken();
    const refreshHash = hashToken(refreshToken);
    const accessHash = hashToken(params.accessToken);

    const values = {
      id: params.sessionId,
      userId: params.userId,
      deviceId: params.deviceId,
      deviceName: params.deviceName,
      deviceType: params.deviceType ?? 'web',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      tokenHash: accessHash,
      refreshTokenHash: refreshHash,
      isActive: true,
      expiresAt: accessExpiresAt,
      refreshExpiresAt,
      lastUsedAt: new Date(),
    };

    await this.db.insert(sessions).values(values);

    const ttl = Math.max(
      0,
      Math.floor((accessExpiresAt.getTime() - Date.now()) / 1000),
    );

    await this.redisService.setJson(
      `session:${params.sessionId}`,
      values,
      ttl || undefined,
    );

    const refreshTtl = Math.max(
      0,
      Math.floor((refreshExpiresAt.getTime() - Date.now()) / 1000),
    );
    await this.redisService.setJson(
      `refresh:${refreshHash}`,
      { sessionId: params.sessionId },
      refreshTtl || undefined,
    );

    return { sessionId: params.sessionId, refreshToken };
  }

  //new access token
  async rotateAndIssueNewAccess(input: RefreshTokenInput): Promise<{
    session: Session;
    newSessionId: string;
    userId: string;
    newRefreshToken: string;
  }> {
    const refreshHash = hashToken(input.refreshToken);

    const cached = await this.redisService.getJson<{ sessionId?: string }>(
      `refresh:${refreshHash}`,
    );

    let sessionId: string | undefined = cached?.sessionId;

    if (!sessionId) {
      const [found] = await this.db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.refreshTokenHash, refreshHash),
            eq(sessions.isActive, true),
          ),
        )
        .limit(1);

      if (!found) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
      sessionId = found.id;
    }

    const [session] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session || !session.isActive || !session.refreshExpiresAt) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (session.refreshExpiresAt < new Date()) {
      await this.revoke(session.id);
      throw new UnauthorizedException('Refresh token expired');
    }

    const newRefreshToken = generateRefreshToken();
    const newRefreshHash = hashToken(newRefreshToken);
    const newAccessExpiresAt = this.resolveExpiry(
      this.configService.get<string>('jwt.accessExpiresIn', '15m'),
    );

    await this.db
      .update(sessions)
      .set({
        refreshTokenHash: newRefreshHash,
        refreshExpiresAt: this.resolveExpiry(
          this.configService.get<string>('jwt.refreshExpiresIn', '7d'),
        ),
        lastUsedAt: new Date(),
        expiresAt: newAccessExpiresAt,
      })
      .where(eq(sessions.id, session.id));

    await this.redisService.del(`refresh:${refreshHash}`);
    await this.redisService.del(`session:${session.id}`);

    const newRefreshTtl = Math.max(
      0,
      Math.floor(
        (this.resolveExpiry(
          this.configService.get<string>('jwt.refreshExpiresIn', '7d'),
        ).getTime() -
          Date.now()) /
          1000,
      ),
    );
    await this.redisService.setJson(
      `refresh:${newRefreshHash}`,
      { sessionId: session.id },
      newRefreshTtl || undefined,
    );

    return {
      session,
      newSessionId: session.id,
      userId: session.userId,
      newRefreshToken,
    };
  }

  async updateAccessTokenAfterRefresh(params: {
    sessionId: string;
    newAccessToken: string;
  }): Promise<void> {
    const newHash = hashToken(params.newAccessToken);
    const newExpiresAt = this.resolveExpiry(
      this.configService.get<string>('jwt.accessExpiresIn', '15m'),
    );

    await this.db
      .update(sessions)
      .set({
        tokenHash: newHash,
        expiresAt: newExpiresAt,
        lastUsedAt: new Date(),
      })
      .where(eq(sessions.id, params.sessionId));

    await this.redisService.del(`session:${params.sessionId}`);

    const ttl = Math.max(
      0,
      Math.floor((newExpiresAt.getTime() - Date.now()) / 1000),
    );
    await this.redisService.setJson(
      `session:${params.sessionId}`,
      {
        id: params.sessionId,
        tokenHash: newHash,
        isActive: true,
        expiresAt: newExpiresAt,
      },
      ttl || undefined,
    );
  }

  async assertActive(sessionId: string, token: string): Promise<void> {
    const redisSession = await this.redisService.getJson<{
      isActive?: boolean;
      tokenHash?: string;
    }>(`session:${sessionId}`);

    console.log(redisSession);

    if (redisSession) {
      if (redisSession.isActive !== true) {
        throw new UnauthorizedException('Session expired or revoked maina');
      }
      if (redisSession.tokenHash !== hashToken(token)) {
        throw new UnauthorizedException('Session expired or revoked gikonyo');
      }
      return;
    }

    const [dbSession] = await this.db
      .select({
        id: sessions.id,
        tokenHash: sessions.tokenHash,
        isActive: sessions.isActive,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.tokenHash, hashToken(token)),
          eq(sessions.isActive, true),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!dbSession) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    const cacheTtl = Math.max(
      0,
      Math.floor((dbSession.expiresAt.getTime() - Date.now()) / 1000),
    );
    if (cacheTtl > 0) {
      await this.redisService.setJson(
        `session:${sessionId}`,
        dbSession,
        cacheTtl,
      );
    }
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ isActive: false })
      .where(eq(sessions.id, sessionId));

    await this.redisService.del(`session:${sessionId}`);
  }

  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const refreshHash = hashToken(refreshToken);

    const [session] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, refreshHash))
      .limit(1);

    if (session) {
      await this.revoke(session.id);
      await this.redisService.del(`refresh:${refreshHash}`);
    }
  }

  async findActiveSessionsForUser(userId: string) {
    return this.db
      .select({
        id: sessions.id,
        deviceName: sessions.deviceName,
        deviceType: sessions.deviceType,
        deviceId: sessions.deviceId,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.isActive, true)))
      .orderBy(desc(sessions.lastUsedAt));
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.db
      .update(sessions)
      .set({ isActive: false })
      .where(and(eq(sessions.userId, userId), eq(sessions.isActive, true)))
      .returning({ id: sessions.id });

    for (const row of result) {
      await this.redisService.del(`session:${row.id}`);
    }
    return result.length;
  }

  private resolveExpiry(expiresIn: string): Date {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!match) {
      return new Date(Date.now() + 15 * 60 * 1000);
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

  getExpiresInSeconds(expiresInStr: string): number {
    const match = /^(\d+)([smhd])$/.exec(expiresInStr);
    if (!match) return 15 * 60;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const mul: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * mul[unit];
  }
}

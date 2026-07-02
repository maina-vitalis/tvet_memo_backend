import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { sessions } from '../../database/schema';
import { hashToken } from '../../common/utils/crypto.util';
import { RedisService } from '../../common/redis/redis.service';

type SessionActorType = 'user' | 'super_admin';

interface BaseCreateSessionInput {
  sessionId: string;
  token: string;
  deviceName?: string;
  deviceType?: string;
  ipAddress?: string;
  userAgent?: string;
}

export type CreateSessionInput =
  | (BaseCreateSessionInput & {
      actorType: 'user';
      userId: string;
    })
  | (BaseCreateSessionInput & {
      actorType: 'super_admin';
      superAdminId: string;
    });

@Injectable()
export class SessionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  //create a session and return the session id
  async create(input: CreateSessionInput): Promise<string> {
    const expiresIn = this.configService.get<string>('jwt.expiresIn', '7d');
    const expiresAt = this.resolveExpiry(expiresIn);

    const values =
      input.actorType === 'user'
        ? {
            id: input.sessionId,
            actorType: 'user' as const,
            userId: input.userId,
            tokenHash: hashToken(input.token),
            deviceName: input.deviceName,
            deviceType: input.deviceType,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            expiresAt,
          }
        : {
            id: input.sessionId,
            actorType: 'super_admin' as const,
            superAdminId: input.superAdminId,
            tokenHash: hashToken(input.token), //acess token is hashed for security
            deviceName: input.deviceName,
            deviceType: input.deviceType,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            expiresAt,
          };

    const [session] = await this.db
      .insert(sessions)
      .values(values)
      .returning({ id: sessions.id });

    // Store in redis for fast session validation (use same lifetime as DB expiry)
    const ttlSeconds = Math.max(
      0,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    );
    await this.redisService.setJson(
      `session:${session.id}`,
      { ...values, isActive: true },
      ttlSeconds || undefined,
    );

    return session.id;
  }

  //assert that a session is active and valid
  async assertActive(
    sessionId: string,
    token: string,
    actorType?: SessionActorType,
  ): Promise<void> {
    const redisSession = await this.redisService.getJson<{
      isActive?: boolean;
      tokenHash?: string;
      actorType?: string;
      [key: string]: unknown;
    }>(`session:${sessionId}`);

    if (redisSession) {
      if (redisSession.isActive !== true) {
        throw new UnauthorizedException('Session expired or revoked');
      }

      if (redisSession.tokenHash !== hashToken(token)) {
        throw new UnauthorizedException('Session expired or revoked');
      }

      if (redisSession.actorType && redisSession.actorType !== actorType) {
        throw new UnauthorizedException('Session expired or revoked');
      }

      return;
    }

    const conditions = [
      eq(sessions.id, sessionId),
      eq(sessions.tokenHash, hashToken(token)),
      eq(sessions.isActive, true),
      gt(sessions.expiresAt, new Date()),
    ];

    if (actorType) {
      conditions.push(eq(sessions.actorType, actorType));
    }

    const [dbSession] = await this.db
      .select({
        id: sessions.id,
        tokenHash: sessions.tokenHash,
        actorType: sessions.actorType,
        isActive: sessions.isActive,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(and(...conditions))
      .limit(1);

    if (!dbSession) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    // Populate redis cache on miss so future requests are fast (retain remaining lifetime)
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

  //revoke the session (db + redis). Update redis entry and retain its original TTL.
  async revoke(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ isActive: false })
      .where(eq(sessions.id, sessionId));

    // Update redis copy so fast-path checks see revocation immediately.
    // Retain remaining TTL instead of deleting or resetting it.
    const key = `session:${sessionId}`;
    const existing = await this.redisService.getJson<Record<string, any>>(key);
    if (existing) {
      const remainingTtl = await this.redisService.ttl(key);
      const updated = { ...existing, isActive: false };
      const ttlToUse = remainingTtl > 0 ? remainingTtl : undefined;
      await this.redisService.setJson(key, updated, ttlToUse);
    }
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

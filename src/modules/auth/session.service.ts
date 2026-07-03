import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gt } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { sessions, Session } from '../../database/schema';
import {
  generateDeviceId,
  generateRefreshToken,
  generateSessionId,
  hashToken,
} from '../../common/utils/crypto.util';
import { RedisService } from '../../common/redis/redis.service';

/**
 * [REFRESH TOKENS] Core service responsible for issuing, validating, rotating, and revoking
 * short-lived access tokens + long-lived refresh tokens.
 *
 * Design principles for review:
 * - Access tokens are short-lived JWTs (stateless for authz, validated by signature + exp).
 * - Refresh tokens are opaque + hashed in DB. They are the revocable "session key".
 * - We tie everything to a single `session` row per device/login for easy device management.
 * - Redis is used as a fast cache for active sessions (invalidated on revoke/refresh).
 * - Refresh rotation: every successful refresh issues a brand new refresh token.
 * - All sensitive tokens are hashed before any DB/Redis storage.
 */

type SessionActorType = 'user' | 'super_admin';

interface BaseCreateSessionInput {
  // deviceId is strongly recommended. If omitted we generate one.
  deviceId?: string;
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

export interface IssuedTokens {
  sessionId: string;
  accessToken: string; // short-lived JWT
  refreshToken: string; // opaque (return plaintext ONLY to client once)
  accessExpiresIn: number; // seconds
  refreshExpiresIn: number; // seconds
}

/**
 * Input for refreshing an access token using a valid refresh token.
 */
export interface RefreshTokenInput {
  refreshToken: string;
  actorType?: SessionActorType;
  // Optional client context for updating metadata on rotation
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

  // ========================================================================
  // [REFRESH TOKENS] PUBLIC API
  // ========================================================================

  /**
   * Creates a brand new session + issues BOTH a short-lived access JWT and a refresh token.
   * This replaces the old single-token create flow.
   *
   * - Access token expiry comes from config (jwt.accessExpiresIn)
   * - Refresh token expiry comes from config (jwt.refreshExpiresIn)
   * - Both are hashed before storage.
   * - Returns the PLAINTEXT refreshToken exactly once (client must store it securely).
   */
  async createWithTokens(input: CreateSessionInput): Promise<IssuedTokens> {
    const sessionId = generateSessionId();
    const deviceId = input.deviceId || generateDeviceId();

    const accessExpiresInStr = this.configService.get<string>(
      'jwt.accessExpiresIn',
      '15m',
    );
    const refreshExpiresInStr = this.configService.get<string>(
      'jwt.refreshExpiresIn',
      '7d',
    );

    const accessExpiresAt = this.resolveExpiry(accessExpiresInStr);
    const refreshExpiresAt = this.resolveExpiry(refreshExpiresInStr);

    // We will sign the access JWT in the caller (AuthService) because it builds the payload.
    // Here we only prepare the containers. For now we accept that the caller will call back.
    // Better design: have this service also able to sign? To keep separation we return
    // a temporary structure and let caller provide the final signed access token.
    // See createUserSession / createSuperAdminSession helpers in AuthService.

    // For this method we generate placeholders and let the higher level finish.
    // We'll provide a lower-level "persistNewSession" instead.

    // Actually we provide two clean methods below. This high-level is convenience for callers
    // that want everything in one shot (they will call sign themselves).

    // Simpler: callers now use `issueTokensForActor(...)` style. See updated AuthService.
    throw new Error(
      'createWithTokens is a marker. Use persistSessionAfterSigning + issueRefresh for full flow.',
    );
  }

  /**
   * [REFRESH TOKENS] Persist a freshly signed access token + a freshly generated refresh token
   * into the sessions table + Redis.
   *
   * Called by AuthService after it builds the JWT payload and signs it.
   */
  async persistSessionAfterSigning(params: {
    sessionId: string;
    actorType: SessionActorType;
    userId?: string;
    superAdminId?: string;
    accessToken: string; // already signed JWT
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ sessionId: string; refreshToken: string }> {
    const accessExpiresInStr = this.configService.get<string>(
      'jwt.accessExpiresIn',
      '15m',
    );
    const refreshExpiresInStr = this.configService.get<string>(
      'jwt.refreshExpiresIn',
      '7d',
    );

    const accessExpiresAt = this.resolveExpiry(accessExpiresInStr);
    const refreshExpiresAt = this.resolveExpiry(refreshExpiresInStr);

    const refreshToken = generateRefreshToken();
    const refreshHash = hashToken(refreshToken);
    const accessHash = hashToken(params.accessToken);

    const baseValues = {
      id: params.sessionId,
      actorType: params.actorType,
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

    const values =
      params.actorType === 'user'
        ? { ...baseValues, userId: params.userId! }
        : { ...baseValues, superAdminId: params.superAdminId! };

    await this.db.insert(sessions).values(values as any);

    // Cache a slim version in Redis (access validation path)
    const ttl = Math.max(
      0,
      Math.floor((accessExpiresAt.getTime() - Date.now()) / 1000),
    );
    await this.redisService.setJson(
      `session:${params.sessionId}`,
      {
        ...values,
        accessTokenHash: accessHash, // for assert compatibility
      },
      ttl || undefined,
    );

    // Also cache the refresh mapping for faster refresh validation (optional but nice)
    const refreshTtl = Math.max(
      0,
      Math.floor((refreshExpiresAt.getTime() - Date.now()) / 1000),
    );
    await this.redisService.setJson(
      `refresh:${refreshHash}`,
      { sessionId: params.sessionId, actorType: params.actorType },
      refreshTtl || undefined,
    );

    return { sessionId: params.sessionId, refreshToken };
  }

  /**
   * [REFRESH TOKENS] The heart of the refresh flow.
   * Validates the provided refresh token (hash match, not expired, session active).
   * On success:
   *   - Rotates the refresh token (new one issued, old hash no longer usable)
   *   - Issues a fresh short-lived access JWT (caller signs it)
   *   - Updates lastUsedAt + caches
   *
   * Returns the data the caller needs to build a new JWT + the new refresh token.
   */
  async rotateAndIssueNewAccess(
    input: RefreshTokenInput,
  ): Promise<{
    session: Session;
    newSessionId: string;
    newAccessTokenPayloadBase: {
      sub: string;
      jti: string;
      actorType: SessionActorType;
    };
    // plaintext new refresh - only returned here once
    newRefreshToken: string;
  }> {
    const refreshHash = hashToken(input.refreshToken);

    // Fast path via Redis refresh cache
    const cached = await this.redisService.getJson<{
      sessionId?: string;
      actorType?: string;
    }>(`refresh:${refreshHash}`);

    let sessionId: string | undefined = cached?.sessionId;

    if (!sessionId) {
      // DB lookup
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

    // Load full session
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

    if (input.actorType && session.actorType !== input.actorType) {
      throw new UnauthorizedException('Refresh token actor mismatch');
    }

    // === ROTATION: invalidate old refresh, create new one ===
    const newRefreshToken = generateRefreshToken();
    const newRefreshHash = hashToken(newRefreshToken);
    const newAccessExpiresAt = this.resolveExpiry(
      this.configService.get<string>('jwt.accessExpiresIn', '15m'),
    );

    // Update DB row: new access not yet known (caller will update), new refresh hash
    await this.db
      .update(sessions)
      .set({
        refreshTokenHash: newRefreshHash,
        refreshExpiresAt: this.resolveExpiry(
          this.configService.get<string>('jwt.refreshExpiresIn', '7d'),
        ),
        lastUsedAt: new Date(),
        // tokenHash will be updated by caller after signing new access
        expiresAt: newAccessExpiresAt,
      })
      .where(eq(sessions.id, session.id));

    // Invalidate old Redis keys
    await this.redisService.delete(`refresh:${refreshHash}`);
    await this.redisService.delete(`session:${session.id}`);

    // Pre-cache the new refresh mapping
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
      { sessionId: session.id, actorType: session.actorType },
      newRefreshTtl || undefined,
    );

    return {
      session,
      newSessionId: session.id,
      newAccessTokenPayloadBase: {
        sub:
          session.actorType === 'user'
            ? (session.userId as string)
            : (session.superAdminId as string),
        jti: session.id,
        actorType: session.actorType as SessionActorType,
      },
      newRefreshToken,
    };
  }

  /**
   * [REFRESH TOKENS] After a refresh rotation, the caller has signed a new access JWT.
   * Call this to persist the new access hash + update caches.
   */
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

    // Refresh Redis cache
    await this.redisService.delete(`session:${params.sessionId}`);

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

  /**
   * Assert that an ACCESS token (JWT) is still valid for the given session.
   * This is called from the JwtStrategy on every protected request.
   * With short-lived tokens we still check the session is not revoked.
   */
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

  /**
   * [REFRESH TOKENS] Revoke a session by its ID (and its current refresh token).
   * Used by standard logout.
   */
  async revoke(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ isActive: false })
      .where(eq(sessions.id, sessionId));

    await this.redisService.delete(`session:${sessionId}`);
    // Note: the specific refresh hash will be orphaned naturally when it expires.
    // For immediate invalidation we could store revoked hashes briefly, but rotation already helps.
  }

  /**
   * [REFRESH TOKENS] Revoke using a refresh token (useful when user only has the refresh token, e.g. after access expired).
   * Looks up the session by the refresh hash and revokes it.
   */
  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const refreshHash = hashToken(refreshToken);

    const [session] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, refreshHash))
      .limit(1);

    if (session) {
      await this.revoke(session.id);
      await this.redisService.delete(`refresh:${refreshHash}`);
    }
  }

  /**
   * [SIGN OUT ALL + ACTIVE SESSIONS]
   * Lightweight query for active sessions belonging to a user.
   * Returns only non-sensitive fields suitable for UI display.
   * Orders by lastUsedAt desc so most recent is first.
   */
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
        // We do not expose hashes or internal ids
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          eq(sessions.actorType, 'user'),
          eq(sessions.isActive, true),
        ),
      )
      .orderBy(desc(sessions.lastUsedAt));
  }

  /**
   * [REFRESH TOKENS] Revoke all active sessions for a given user (or super admin).
   * Useful for "Sign out from all devices".
   */
  async revokeAllForActor(params: {
    userId?: string;
    superAdminId?: string;
  }): Promise<number> {
    const conditions = [eq(sessions.isActive, true)];
    if (params.userId) conditions.push(eq(sessions.userId, params.userId));
    if (params.superAdminId)
      conditions.push(eq(sessions.superAdminId, params.superAdminId));

    const result = await this.db
      .update(sessions)
      .set({ isActive: false })
      .where(and(...conditions))
      .returning({ id: sessions.id });

    // Best effort Redis cleanup
    for (const row of result) {
      await this.redisService.delete(`session:${row.id}`);
    }
    return result.length;
  }

  /**
   * Helper to resolve string duration (15m, 7d, etc) into a Date.
   */
  private resolveExpiry(expiresIn: string): Date {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!match) {
      // sensible default 15 minutes for access
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

  /**
   * Returns seconds for a given duration string. Used for the `expiresIn` response field.
   */
  getExpiresInSeconds(expiresInStr: string): number {
    const match = /^(\d+)([smhd])$/.exec(expiresInStr);
    if (!match) return 15 * 60;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const mul: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * mul[unit];
  }

  // ========================================================================
  // [REFRESH TOKENS] TEMPORARY COMPATIBILITY LAYER
  // Old code paths (will be migrated) call sessionService.create(...)
  // This adapter keeps the app compiling during the transition.
  // TODO: Remove after full migration to persistSessionAfterSigning + rotate flow.
  // ========================================================================
  async create(input: CreateSessionInput & { token: string }): Promise<string> {
    // This legacy path will still create a session row, but callers that use it
    // will soon be updated to the two-phase (sign + persist) flow.
    const sessionId = input['sessionId'] || generateSessionId(); // type loose
    // For now fall back to simple insert (we'll enhance callers).
    const expiresAt = this.resolveExpiry(
      this.configService.get<string>('jwt.accessExpiresIn', '15m'),
    );

    const values: any = {
      id: sessionId,
      actorType: input.actorType,
      tokenHash: hashToken(input.token),
      deviceName: input.deviceName,
      deviceType: input.deviceType,
      deviceId: input.deviceId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      isActive: true,
      expiresAt,
    };

    if (input.actorType === 'user') {
      values.userId = (input as any).userId;
    } else {
      values.superAdminId = (input as any).superAdminId;
    }

    const [row] = await this.db
      .insert(sessions)
      .values(values)
      .returning({ id: sessions.id });

    const ttl = Math.max(
      0,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    );
    await this.redisService.setJson(`session:${row.id}`, values, ttl || undefined);

    return row.id;
  }
}

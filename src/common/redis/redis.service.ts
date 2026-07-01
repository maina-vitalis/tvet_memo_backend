import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.getOrThrow<string>('redis.url');

    this.client = new Redis(redisUrl);

    this.client.on('connect', () => {
      console.log('✅ Connected to Redis');
    });

    this.client.on('error', (err: Error) => {
      console.error('❌ Redis connection error:', err);
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string | number | Buffer,
    ttlSeconds?: number,
  ): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(keys: string | string[]): Promise<number> {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    if (keyArray.length === 0) return 0;
    return this.client.del(...keyArray);
  }

  // ============================
  // JSON helpers (recommended)
  // ============================

  /**
   * Get and automatically parse JSON.
   */
  async getJson<T>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as T;
    } catch (e) {
      console.warn(`Redis: Failed to parse JSON for key "${key}"`, e);
      return null;
    }
  }

  /**
   * Stringify and store value as JSON. Optionally with TTL.
   */
  async setJson(
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.setex(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /**
   * Cache-aside pattern. Get from cache or compute + store.
   *
   * Example:
   * const user = await redisService.getOrSet(
   *   `user:${userId}`,
   *   () => db.findUser(userId),
   *   300 // 5 minutes
   * );
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== null) {
      return cached;
    }

    const freshValue = await factory();
    await this.setJson(key, freshValue, ttlSeconds);
    return freshValue;
  }

  // ============================
  // Hash operations (great for per-tenant data)
  // ============================

  async hget<T = string>(key: string, field: string): Promise<T | null> {
    const value = await this.client.hget(key, field);
    if (value === null) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async hset(key: string, field: string, value: unknown): Promise<void> {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value);
    await this.client.hset(key, field, serialized);
  }

  async hgetAll<T = string>(key: string): Promise<Record<string, T>> {
    const result = await this.client.hgetall(key);
    const parsed: Record<string, T> = {};

    for (const [field, value] of Object.entries(result)) {
      try {
        parsed[field] = JSON.parse(value) as T;
      } catch {
        parsed[field] = value as unknown as T;
      }
    }

    return parsed;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(key, ...fields);
  }

  // ============================
  // Utility / Counter operations
  // ============================

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return (await this.client.expire(key, seconds)) === 1;
  }

  /**
   * Increment a counter. Useful for rate limiting.
   */
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async incrBy(key: string, amount: number): Promise<number> {
    return this.client.incrby(key, amount);
  }

  // ============================
  // Bulk / Pattern operations
  // ============================

  /**
   * Delete keys matching a pattern (e.g. "user:123:*").
   * Uses SCAN to avoid blocking Redis.
   */
  async delByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const result = await this.client.del(...keys);
        deleted += result;
      }
    } while (cursor !== '0');

    return deleted;
  }

  // ============================
  // Lifecycle
  // ============================

  async onModuleDestroy() {
    await this.client.quit();
  }
}

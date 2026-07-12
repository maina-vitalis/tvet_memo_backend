import type { RedisOptions } from 'ioredis';

/** Bull requires maxRetriesPerRequest: null and benefits from a bounded connect timeout. */
export function createBullRedisOptions(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  const isTls = url.protocol === 'rediss:';

  return {
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 6379,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    connectTimeout: 10_000,
    maxRetriesPerRequest: null,
    ...(isTls ? { tls: {} } : {}),
  };
}

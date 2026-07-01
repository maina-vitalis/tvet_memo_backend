import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export class RedisService implements OnModuleDestroy {
  private readonly redisClient: Redis;
  constructor(private readonly configservice: ConfigService) {
    const redisUrl = this.configservice.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }

    this.redisClient = new Redis(redisUrl);

    this.redisClient.on('connect', () => {
      console.log('Connected to Redis');
    });

    this.redisClient.on('error', (err: any) => {
      console.error('Redis error:', err);
    });
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
  }
}

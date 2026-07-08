import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { ExpoProvider } from './expo.provider';
import { NotificationsProcessor } from './notifications.processor';
import {
  NOTIFICATIONS_QUEUE,
  NotificationsService,
} from './notifications.service';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueueAsync({
      name: NOTIFICATIONS_QUEUE,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: configService.get<string>('redis.url'),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
        },
      }),
    }),
  ],
  providers: [NotificationsService, NotificationsProcessor, ExpoProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module';
import { MemosController } from './memos.controller';
import { MemoTargetingService } from './memo-targeting.service';
import { MemosService } from './memos.service';

@Module({
  imports: [NotificationsModule],
  controllers: [MemosController],
  providers: [MemosService, MemoTargetingService],
  exports: [MemosService, MemoTargetingService],
})
export class MemosModule {}
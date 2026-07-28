import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notifications.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { MemosController } from './memos.controller';
import { MemoAttachmentsService } from './memo-attachments.service';
import { MemoTargetingService } from './memo-targeting.service';
import { MemosService } from './memos.service';

@Module({
  imports: [NotificationsModule, CloudinaryModule],
  controllers: [MemosController],
  providers: [MemosService, MemoAttachmentsService, MemoTargetingService],
  exports: [MemosService, MemoAttachmentsService, MemoTargetingService],
})
export class MemosModule {}

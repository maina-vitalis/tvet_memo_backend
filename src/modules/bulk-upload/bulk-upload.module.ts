import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { BulkUploadController } from './bulk-upload.controller';
import { BulkUploadService } from './bulk-upload.service';

@Module({
  imports: [EmailModule],
  controllers: [BulkUploadController],
  providers: [BulkUploadService],
})
export class BulkUploadModule {}

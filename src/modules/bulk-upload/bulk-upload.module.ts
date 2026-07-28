import { Module } from '@nestjs/common';
import { BulkUploadController } from './bulk-upload.controller';
import { BulkUploadService } from './bulk-upload.service';
import { InstitutionsModule } from '../institutions/institutions.module';

@Module({
  imports: [InstitutionsModule],
  controllers: [BulkUploadController],
  providers: [BulkUploadService],
})
export class BulkUploadModule {}

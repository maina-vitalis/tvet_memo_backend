import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { InstitutionsController } from './institutions.controller';
import { InstitutionsService } from './institutions.service';
import { SuperAdminInstitutionsController } from './super-admin-institutions.controller';
import { SuperAdminInstitutionsService } from './super-admin-institutions.service';

@Module({
  imports: [MailModule],
  controllers: [InstitutionsController, SuperAdminInstitutionsController],
  providers: [InstitutionsService, SuperAdminInstitutionsService],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}
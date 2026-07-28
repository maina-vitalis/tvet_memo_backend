import { Module } from '@nestjs/common';
import { OtpModule } from '../auth/otp.module';
import { MailModule } from '../mail/mail.module';
import { InstitutionsController } from './institutions.controller';
import { InstitutionsService } from './institutions.service';
import { InstitutionQuotaService } from './institution-quota.service';
import { SuperAdminInstitutionsController } from './super-admin-institutions.controller';
import { SuperAdminInstitutionsService } from './super-admin-institutions.service';

@Module({
  imports: [MailModule, OtpModule],
  controllers: [InstitutionsController, SuperAdminInstitutionsController],
  providers: [
    InstitutionsService,
    InstitutionQuotaService,
    SuperAdminInstitutionsService,
  ],
  exports: [InstitutionsService, InstitutionQuotaService],
})
export class InstitutionsModule {}
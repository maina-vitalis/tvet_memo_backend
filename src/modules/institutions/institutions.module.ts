import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { SuperAdminAuthModule } from '../super-admin-auth/super-admin-auth.module';
import { InstitutionsController } from './institutions.controller';
import { SuperAdminInstitutionsController } from './super-admin-institutions.controller';
import { InstitutionsService } from './institutions.service';

@Module({
  imports: [MailModule, SuperAdminAuthModule],
  controllers: [InstitutionsController, SuperAdminInstitutionsController],
  providers: [InstitutionsService],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}

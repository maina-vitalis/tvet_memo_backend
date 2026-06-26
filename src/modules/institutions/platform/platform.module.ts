import { Module } from '@nestjs/common';
import { InstitutionsModule } from '../institutions.module';
import { SuperAdminAuthModule } from '../../super-admin-auth/super-admin-auth.module';
import { PlatformInstitutionsController } from './platform-institutions.controller';

@Module({
  imports: [SuperAdminAuthModule, InstitutionsModule],
  controllers: [PlatformInstitutionsController],
})
export class PlatformModule {}

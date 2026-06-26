import { Module } from '@nestjs/common';
import { SuperAdminAuthService } from './super-admin-auth.service';
import { SuperAdminAuthController } from './super-admin-auth.controller';

@Module({
  controllers: [SuperAdminAuthController],
  providers: [SuperAdminAuthService],
})
export class SuperAdminAuthModule {}

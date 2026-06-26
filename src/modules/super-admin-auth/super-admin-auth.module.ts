import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module';
import { SuperAdminAuthController } from './super-admin-auth.controller';
import { SuperAdminAuthService } from './super-admin-auth.service';
import { SuperAdminJwtStrategy } from './super-admin-jwt.strategy';

@Module({
  imports: [PassportModule, AuthModule],
  controllers: [SuperAdminAuthController],
  providers: [SuperAdminAuthService, SuperAdminJwtStrategy],
  exports: [SuperAdminJwtStrategy],
})
export class SuperAdminAuthModule {}

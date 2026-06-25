import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../../auth/auth.module';
import { InstitutionsModule } from '../institutions.module';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformInstitutionsController } from './platform-institutions.controller';
import { PlatformJwtStrategy } from './platform-jwt.strategy';

@Module({
  imports: [PassportModule, AuthModule, InstitutionsModule],
  controllers: [PlatformAuthController, PlatformInstitutionsController],
  providers: [PlatformAuthService, PlatformJwtStrategy],
})
export class PlatformModule {}

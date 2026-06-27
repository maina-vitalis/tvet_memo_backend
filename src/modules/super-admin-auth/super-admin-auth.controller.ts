import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentSuperAdmin } from '../../common/decorators/super-admin.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { AuthenticatedSuperAdmin } from '../../common/types/super-admin.type';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';
import { SuperAdminAuthService } from './super-admin-auth.service';

@Controller('superadmin')
export class SuperAdminAuthController {
  constructor(private readonly superAdminAuthService: SuperAdminAuthService) {}

  @Public()
  @Post('login')
  login(@Body() superAdminLoginDto: SuperAdminLoginDto, @Req() req: Request) {
    return this.superAdminAuthService.login(superAdminLoginDto, req);
  }

  @Public()
  @UseGuards(SuperAdminGuard)
  @Post('logout')
  logout(@CurrentSuperAdmin() superAdmin: AuthenticatedSuperAdmin) {
    return this.superAdminAuthService.logout(superAdmin.sessionId);
  }
}

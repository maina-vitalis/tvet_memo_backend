import { Controller, Post, Body } from '@nestjs/common';
import { SuperAdminAuthService } from './super-admin-auth.service';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';

@Controller('super-admin-auth')
export class SuperAdminAuthController {
  constructor(private readonly superAdminAuthService: SuperAdminAuthService) {}

  @Post()
  login(@Body() superAdminLoginDto: SuperAdminLoginDto) {
    return this.superAdminAuthService.login(superAdminLoginDto);
  }
}

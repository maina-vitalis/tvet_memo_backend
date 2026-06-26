import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';
import { SuperAdminAuthService } from './super-admin-auth.service';

@Public()
@Controller('superadmin')
export class SuperAdminAuthController {
  constructor(private readonly superAdminAuthService: SuperAdminAuthService) {}

  @Post('login')
  login(@Body() superAdminLoginDto: SuperAdminLoginDto) {
    return this.superAdminAuthService.login(superAdminLoginDto);
  }
}

import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { PlatformAuthService } from './platform-auth.service';

@Public()
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly platformAuthService: PlatformAuthService) {}

  @Post('login')
  login(@Body() dto: PlatformLoginDto) {
    return this.platformAuthService.login(dto);
  }
}

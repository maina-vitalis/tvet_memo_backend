import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  EmailLoginDto,
  InitiateEmailLoginDto,
  RegistryLoginDto,
} from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Email flow - Step 1
  @Public()
  @Post('login/email/initiate')
  initiateEmailLogin(@Body() dto: InitiateEmailLoginDto) {
    return this.authService.initiateEmailLogin(dto);
  }

  // Email flow - Step 2
  @Public()
  @Post('login/email')
  emailLogin(@Body() dto: EmailLoginDto, @Req() req: Request) {
    return this.authService.emailLogin(dto, req);
  }

  // Shortcode flow: admission number + password (institution already discovered)
  @Public()
  @Post('login/registry')
  registryLogin(@Body() dto: RegistryLoginDto, @Req() req: Request) {
    return this.authService.registryLogin(dto, req);
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.authService.logout(user, req);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id, user.institutionId);
  }

  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.authService.changePassword(
      user.id,
      user.institutionId,
      dto.currentPassword,
      dto.newPassword,
      req,
    );
  }
}

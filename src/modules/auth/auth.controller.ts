import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { AuthService } from './auth.service';
import {
  AdminLoginDto,
  CompleteAccountSetupDto,
  VerifySetupTokenDto,
} from './dto/admin-auth.dto';
import {
  ChangePasswordDto,
  CheckEmailLoginDto,
  CompleteEmailSetupDto,
  EmailLoginDto,
  EmailPasswordLoginDto,
  InitiateEmailLoginDto,
  RegistryLoginDto,
  ValidateEmailOtpDto,
} from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Institution admin portal login
  @Public()
  @Post('login')
  adminLogin(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.authService.adminLogin(dto, req);
  }

  @Public()
  @Post('setup/verify')
  verifySetupToken(@Body() dto: VerifySetupTokenDto) {
    return this.authService.verifySetupToken(dto);
  }

  @Public()
  @Post('setup/complete')
  completeAccountSetup(
    @Body() dto: CompleteAccountSetupDto,
    @Req() req: Request,
  ) {
    return this.authService.completeAccountSetup(dto, req);
  }

  // Email flow - Step 1 Institution discovery + email verification code generation
  @Public()
  @Post('login/email/initiate')
  initiateEmailLogin(@Body() dto: InitiateEmailLoginDto) {
    return this.authService.initiateEmailLogin(dto);
  }

  @Public()
  @Post('login/email/check')
  checkEmailLogin(@Body() dto: CheckEmailLoginDto) {
    return this.authService.checkEmailLogin(dto);
  }

  @Public()
  @Post('login/email/validate-otp')
  validateEmailOtp(@Body() dto: ValidateEmailOtpDto) {
    return this.authService.validateEmailOtp(dto);
  }

  @Public()
  @Post('login/email/password')
  emailPasswordLogin(@Body() dto: EmailPasswordLoginDto, @Req() req: Request) {
    return this.authService.emailPasswordLogin(dto, req);
  }

  @Public()
  @Post('login/email/complete-setup')
  completeEmailSetup(@Body() dto: CompleteEmailSetupDto, @Req() req: Request) {
    return this.authService.completeEmailSetup(dto, req);
  }

  // Email flow - Step 2 (legacy: verify OTP and sign in directly)
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

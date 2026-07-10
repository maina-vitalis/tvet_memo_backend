import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { AuthService } from './auth.service';
import {
  CompleteAccountSetupDto,
  VerifySetupTokenDto,
} from './dto/admin-auth.dto';
import {
  ChangePasswordDto,
  CheckEmailLoginDto,
  EmailPasswordLoginDto,
  RefreshTokenDto,
  RegistryLoginDto,
  UnifiedLoginDto,
} from './dto/login.dto';
import {
  SignupRegisterDto,
  SignupResendOtpDto,
  SignupVerifyOtpDto,
} from './dto/signup.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** [AUTH] Unified login — all roles, branches only on totpEnabled. */
  @Public()
  @Post('login')
  login(@Body() dto: UnifiedLoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
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

  @Public()
  @Post('login/email/check')
  checkEmailLogin(@Body() dto: CheckEmailLoginDto) {
    return this.authService.checkEmailLogin(dto);
  }

  @Public()
  @Post('signup/register')
  signupRegister(@Body() dto: SignupRegisterDto) {
    return this.authService.signupRegister(dto);
  }

  @Public()
  @Post('signup/resend-otp')
  signupResendOtp(@Body() dto: SignupResendOtpDto) {
    return this.authService.signupResendOtp(dto);
  }

  @Public()
  @Post('signup/verify')
  signupVerifyOtp(@Body() dto: SignupVerifyOtpDto, @Req() req: Request) {
    return this.authService.signupVerifyOtp(dto, req);
  }

  @Public()
  @Post('login/email/password')
  emailPasswordLogin(@Body() dto: EmailPasswordLoginDto, @Req() req: Request) {
    return this.authService.emailPasswordLogin(dto, req);
  }

  @Public()
  @Post('login/registry')
  registryLogin(@Body() dto: RegistryLoginDto, @Req() req: Request) {
    return this.authService.registryLogin(dto, req);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }

  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      req,
    );
  }

  @Get('sessions')
  getActiveSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getActiveSessions(user);
  }

  @Post('logout-all')
  logoutAll(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.authService.logoutAll(user, req);
  }

  @Post('sessions/:id/logout')
  logoutSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
    @Req() req: Request,
  ) {
    return this.authService.logoutSpecificSession(user, sessionId, req);
  }

  @Public()
  @Post('logout')
  logout(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() body: { refreshToken?: string } = {},
    @Req() req: Request,
  ) {
    return this.authService.logout(user, req, body.refreshToken);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refreshTokens(dto.refreshToken, req);
  }
}

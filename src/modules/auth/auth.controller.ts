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
  CompleteEmailSetupDto,
  EmailLoginDto,
  EmailPasswordLoginDto,
  InitiateEmailLoginDto,
  RefreshTokenDto,
  RegistryLoginDto,
  UnifiedLoginDto,
  ValidateEmailOtpDto,
} from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** [AUTH] Unified login — all roles, branches only on totpEnabled. */
  @Public()
  @Post('login')
  login(@Body() dto: UnifiedLoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
  }

  //veify the setup token sent to the admin email during institution provisioning
  @Public()
  @Post('setup/verify')
  verifySetupToken(@Body() dto: VerifySetupTokenDto) {
    return this.authService.verifySetupToken(dto);
  }

  //complete the account setup for the admin after verifying the setup token
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

  // ========================================================================
  // [REFRESH TOKENS + SESSIONS] Device & Session Management
  // ========================================================================

  /**
   * [SIGN OUT ALL + ACTIVE SESSIONS]
   * Returns lightweight list of active sessions for the current authenticated user.
   * Useful for "Where you're logged in" UI. Marks the current session.
   */
  @Get('sessions')
  getActiveSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getActiveSessions(user);
  }

  /**
   * [SIGN OUT ALL + ACTIVE SESSIONS]
   * Revokes ALL active sessions for the current user (including this one).
   * Client should clear local tokens after calling.
   */
  @Post('logout-all')
  logoutAll(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.authService.logoutAll(user, req);
  }

  /**
   * Revoke a specific session by its ID (one device).
   * User can only revoke their own sessions.
   */
  @Post('sessions/:id/logout')
  logoutSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
    @Req() req: Request,
  ) {
    return this.authService.logoutSpecificSession(user, sessionId, req);
  }

  /**
   * Standard logout for current device.
   * Supports optional refreshToken in body for cases where access is already invalid.
   * Marked public so clients can logout using refresh token alone (e.g. expired access token,
   * or cross-auth flows like super-admin tokens).
   */
  @Public()
  @Post('logout')
  logout(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() body: { refreshToken?: string } = {},
    @Req() req: Request,
  ) {
    return this.authService.logout(user, req, body.refreshToken);
  }

  // [REFRESH TOKENS] kept as-is
  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refreshTokens(dto.refreshToken, req);
  }
}

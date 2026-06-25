import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PlatformJwtPayload } from '../../../common/types/platform-admin.type';
import { PlatformLoginDto } from './dto/platform-login.dto';

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: PlatformLoginDto) {
    const adminEmail = this.configService.getOrThrow<string>(
      'platform.adminEmail',
    );
    const adminPassword = this.configService.getOrThrow<string>(
      'platform.adminPassword',
    );

    const emailMatches =
      dto.email.toLowerCase() === adminEmail.toLowerCase();
    const passwordMatches = dto.password === adminPassword;

    if (!emailMatches || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const expiresIn = this.configService.get<string>('jwt.expiresIn', '7d');

    const payload: PlatformJwtPayload = {
      sub: 'platform-admin',
      type: 'platform',
      email: adminEmail.toLowerCase(),
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn,
    };
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  PlatformAdmin,
  PlatformJwtPayload,
} from '../../../../common/types/platform-admin.type';

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(
  Strategy,
  'platform-jwt',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  validate(payload: PlatformJwtPayload): PlatformAdmin {
    if (payload.type !== 'platform' || payload.sub !== 'platform-admin') {
      throw new UnauthorizedException('Invalid platform token');
    }

    return {
      id: 'platform-admin',
      email: payload.email,
    };
  }
}

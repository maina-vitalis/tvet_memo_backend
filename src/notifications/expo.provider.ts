import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Expo } from 'expo-server-sdk';

@Injectable()
export class ExpoProvider {
  readonly client: Expo;

  constructor(private readonly configService: ConfigService) {
    const accessToken = this.configService.get<string>('expo.accessToken');
    this.client = new Expo(accessToken ? { accessToken } : undefined);
  }

  isExpoPushToken(token: string): boolean {
    return Expo.isExpoPushToken(token);
  }
}

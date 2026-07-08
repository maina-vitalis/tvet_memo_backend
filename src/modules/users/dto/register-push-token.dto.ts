import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsOptional()
  deviceName?: string;
}

export class DeactivatePushTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

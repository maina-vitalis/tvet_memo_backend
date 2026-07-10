import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class SignupRegisterDto {
  @IsUUID()
  institutionId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsOptional()
  deviceName?: string;

  @IsString()
  @IsOptional()
  deviceType?: string;

  @IsString()
  @IsOptional()
  deviceId?: string;
}

export class SignupResendOtpDto {
  @IsUUID()
  institutionId!: string;

  @IsEmail()
  email!: string;
}

export class SignupVerifyOtpDto {
  @IsUUID()
  institutionId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  otp!: string;

  @IsString()
  @IsOptional()
  deviceName?: string;

  @IsString()
  @IsOptional()
  deviceType?: string;

  @IsString()
  @IsOptional()
  deviceId?: string;
}

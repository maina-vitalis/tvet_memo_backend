import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

/** [AUTH] Unified login — all roles use the same endpoint. */
export class UnifiedLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
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

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class InitiateEmailLoginDto {
  @IsUUID()
  institutionId!: string;

  @IsEmail()
  email!: string;
}

export class CheckEmailLoginDto {
  @IsUUID()
  institutionId!: string;

  @IsEmail()
  email!: string;
}

export class ValidateEmailOtpDto {
  @IsUUID()
  institutionId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  otp!: string;
}

export class EmailPasswordLoginDto {
  @IsUUID()
  institutionId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
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

export class CompleteEmailSetupDto {
  @IsUUID()
  institutionId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  otp!: string;

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

export class EmailLoginDto {
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

export class RegistryLoginDto {
  @IsUUID()
  institutionId!: string;

  @IsString()
  @IsNotEmpty()
  admissionNumber!: string;

  @IsString()
  @IsNotEmpty()
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

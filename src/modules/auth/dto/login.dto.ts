import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

const PASSWORD_PATTERN =
  /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

// Email flow - Step 1: send OTP after institution discovery
export class InitiateEmailLoginDto {
  @IsUUID()
  institutionId!: string;

  @IsEmail()
  email!: string;
}

// Email flow - Step 2: verify OTP and sign in
export class EmailLoginDto {
  @IsUUID()
  institutionId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;

  @IsString()
  @IsOptional()
  deviceName?: string;

  @IsString()
  @IsOptional()
  deviceType?: string;
}

// Shortcode flow: sign in with admission number + password (institution already discovered)
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
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(PASSWORD_PATTERN, {
    message:
      'Password must include uppercase, a number, and a special character',
  })
  newPassword!: string;
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
  @Length(6, 6)
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
}

export class CompleteEmailSetupDto {
  @IsUUID()
  institutionId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(PASSWORD_PATTERN, {
    message:
      'Password must include uppercase, a number, and a special character',
  })
  password!: string;

  @IsString()
  @IsOptional()
  deviceName?: string;

  @IsString()
  @IsOptional()
  deviceType?: string;
}

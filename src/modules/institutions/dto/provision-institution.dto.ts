import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum InstitutionPlan {
  TRIAL = 'trial',
  BASIC = 'basic',
  PRO = 'pro',
}

export class ProvisionInstitutionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'subdomain must be lowercase alphanumeric with hyphens',
  })
  subdomain!: string;

  @IsEmail()
  contactEmail!: string;

  @IsEnum(InstitutionPlan)
  plan!: InstitutionPlan;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  principalFirstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  principalLastName!: string;

  @IsEmail()
  principalEmail!: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  principalPassword?: string;
}

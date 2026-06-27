import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';

export const INSTITUTION_PLANS = ['trial', 'basic', 'pro'] as const;
export const INSTITUTION_STATUSES = ['trial', 'active', 'pending', 'suspended'] as const;

export class UpdateInstitutionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  contactEmail?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  seatQuota?: number;

  @IsOptional()
  @IsEnum(INSTITUTION_PLANS)
  plan?: (typeof INSTITUTION_PLANS)[number];

  @IsOptional()
  @IsEnum(INSTITUTION_STATUSES)
  status?: (typeof INSTITUTION_STATUSES)[number];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  provisioningNotes?: string;
}

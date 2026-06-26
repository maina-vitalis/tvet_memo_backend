import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const PROVISION_INITIAL_STATUSES = [
  'trial',
  'active',
  'pending',
] as const;

export type ProvisionInitialStatus =
  (typeof PROVISION_INITIAL_STATUSES)[number];

export class ProvisionInstitutionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  institutionName!: string;

  @IsString()
  @Matches(/^[A-Z0-9]{2,10}$/, {
    message: 'shortcode must be 2-10 uppercase letters or numbers',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  shortcode!: string;

  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'subdomainSlug must use lowercase letters, numbers, and hyphens only',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  subdomainSlug!: string;

  @IsInt()
  @Min(1)
  @Max(100_000)
  seatQuota!: number;

  @IsEnum(PROVISION_INITIAL_STATUSES)
  initialStatus!: ProvisionInitialStatus;

  @IsInt()
  @Min(1)
  @Max(1_095)
  subscriptionDays!: number;

  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  adminEmail!: string;

  @IsString()
  @MinLength(2)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  adminFullName!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  provisioningNotes?: string;
}

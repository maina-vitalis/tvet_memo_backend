import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ProvisionInstitutionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'shortcode must be uppercase alphanumeric',
  })
  shortcode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'subdomain must be lowercase alphanumeric with hyphens',
  })
  subdomain!: string;

  @IsEmail()
  rootEmail!: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  seatQuota!: number;
}

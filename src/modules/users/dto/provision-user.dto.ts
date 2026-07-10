import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ProvisionUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }): string =>
    typeof value === 'string' ? value.trim() : value,
  )
  firstName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }): string =>
    typeof value === 'string' ? value.trim() : value,
  )
  lastName!: string;

  @IsEmail()
  @Transform(({ value }): string =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Transform(({ value }): string =>
    typeof value === 'string' ? value.trim() : value,
  )
  admissionNumber!: string;

  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  @Transform(({ value }): string =>
    typeof value === 'string' ? value.trim() : value,
  )
  phoneNumber?: string;
}

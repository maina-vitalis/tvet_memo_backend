import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(8)
  hierarchyLevel!: number;

  @IsObject()
  @IsOptional()
  sendScope?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  contentAccess?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  adminRights?: Record<string, unknown>;
}

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsInt()
  @Min(1)
  @Max(8)
  @IsOptional()
  hierarchyLevel?: number;

  @IsObject()
  @IsOptional()
  sendScope?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  contentAccess?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  adminRights?: Record<string, unknown>;
}

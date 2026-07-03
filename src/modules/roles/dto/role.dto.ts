import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * [RBAC PERMISSIONS TABLE]
 * We are moving away from unstructured JSONB toward explicit permissions.
 * During transition we still accept the old fields for backward compatibility.
 */
export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(8)
  hierarchyLevel!: number;

  /**
   * List of permission keys or IDs to grant to this role.
   * Preferred way going forward.
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionKeys?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  permissionIds?: string[];

  // Legacy fields kept for transition period
  @IsOptional()
  sendScope?: Record<string, unknown>;

  @IsOptional()
  contentAccess?: Record<string, unknown>;

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

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionKeys?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  permissionIds?: string[];

  @IsOptional()
  sendScope?: Record<string, unknown>;

  @IsOptional()
  contentAccess?: Record<string, unknown>;

  @IsOptional()
  adminRights?: Record<string, unknown>;
}

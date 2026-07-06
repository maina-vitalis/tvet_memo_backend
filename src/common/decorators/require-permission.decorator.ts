import { SetMetadata } from '@nestjs/common';
import { Permission } from '../rbac/permission.enum';

export const PERMISSIONS_KEY = 'permissions';

/**
 * [RBAC] Declares required permissions for a route.
 * Use with PermissionsGuard — checks ROLE_PERMISSIONS[request.user.role].
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** @deprecated Use RequirePermissions — kept for incremental migration. */
export const RequirePermission = RequirePermissions;

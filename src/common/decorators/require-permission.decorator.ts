import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * @RequirePermission('tenant.users.manage')
 *
 * Use together with:
 * @UseGuards(PermissionsGuard)
 *
 * Works for both tenant users and super admins because both
 * carry a `permissions: string[]` array after successful auth.
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

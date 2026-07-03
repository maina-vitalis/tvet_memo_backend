import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

/**
 * [RBAC] Permissions Guard
 *
 * Checks if the authenticated user has at least one of the required permissions.
 *
 * Usage:
 *   @UseGuards(PermissionsGuard)
 *   @RequirePermission('tenant.memos.send.broadcast')
 *
 * Note: Super admin permissions are also supported via the same mechanism
 * because both AuthenticatedUser and AuthenticatedSuperAdmin carry .permissions
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permission required on this route
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { permissions?: string[] } | undefined;

    if (!user?.permissions || user.permissions.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    const hasPermission = requiredPermissions.some((perm) =>
      user.permissions!.includes(perm),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Missing required permission(s): ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { Permission } from '../rbac/permission.enum';
import { ROLE_PERMISSIONS } from '../rbac/role-permissions';
import { AuthenticatedUser } from '../types/auth-user.type';

/** [RBAC] Checks ROLE_PERMISSIONS[request.user.role] against @RequirePermissions(...). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    console.log('metadata', required);

    if (!required || required.length === 0) {
      return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = context.switchToHttp().getRequest();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const user = request.user as AuthenticatedUser | undefined;

    if (!user?.role) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    const granted = ROLE_PERMISSIONS[user.role] ?? [];
    const hasAll = required.every((p) => granted.includes(p));

    if (!hasAll) {
      throw new ForbiddenException(
        `Missing required permission(s): ${required.join(', ')}`,
      );
    }

    return true;
  }
}

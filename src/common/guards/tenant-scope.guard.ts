import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Role } from '../rbac/role.enum';
import { AuthenticatedUser } from '../types/auth-user.type';

/** [RBAC] Injects institutionId into CLS for automatic tenant query scoping. */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as
      | AuthenticatedUser
      | undefined;

    if (user && user.role !== Role.SUPER_ADMIN && user.institutionId) {
      this.cls.set('institutionId', user.institutionId);
    }

    return true;
  }
}
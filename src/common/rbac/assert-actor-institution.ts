import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../types/auth-user.type';
import { Role } from './role.enum';

/** [RBAC] Cross-tenant guard — SUPER_ADMIN may act on any institution. */
export function assertActorInstitution(
  actor: AuthenticatedUser,
  institutionId: string,
): void {
  if (actor.role === Role.SUPER_ADMIN) return;
  if (actor.institutionId !== institutionId) {
    throw new ForbiddenException(
      'Cannot manage users outside your institution',
    );
  }
}

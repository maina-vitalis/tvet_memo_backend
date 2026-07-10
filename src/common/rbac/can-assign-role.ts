import { ROLE_RANK } from './role-rank';
import { Role } from './role.enum';

/**
 * [RBAC] Role-assignment ceiling — prevents privilege escalation via MANAGE_ROLES.
 * Actors may only assign roles strictly below their own rank.
 */
export function canAssignRole(
  actor: { role: Role },
  targetRole: Role,
): boolean {
  return ROLE_RANK[targetRole] < ROLE_RANK[actor.role];
}

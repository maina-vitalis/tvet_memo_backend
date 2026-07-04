import { Permission } from './permission.enum';
import { Role } from './role.enum';

/** [RBAC] Static role → permission map. No database lookup required. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),
  [Role.CHAIRPERSON]: [
    Permission.VIEW_BOARD_REPORTS,
    Permission.VIEW_AUDIT_LOGS,
    Permission.ACKNOWLEDGE_MEMO,
  ],
  [Role.BOARD_MEMBER]: [
    Permission.VIEW_BOARD_REPORTS,
    Permission.ACKNOWLEDGE_MEMO,
  ],
  [Role.PRINCIPAL]: [
    Permission.MANAGE_TENANT_USERS,
    Permission.MANAGE_ROLES,
    Permission.BROADCAST_MEMO,
    Permission.APPROVE_MEMO,
    Permission.VIEW_AUDIT_LOGS,
    Permission.ACKNOWLEDGE_MEMO,
  ],
  [Role.DEPUTY_PRINCIPAL_ACADEMICS]: [
    Permission.BROADCAST_MEMO,
    Permission.APPROVE_MEMO,
    Permission.ACKNOWLEDGE_MEMO,
  ],
  [Role.DEPUTY_PRINCIPAL_ADMIN]: [
    Permission.MANAGE_TENANT_USERS,
    Permission.BROADCAST_MEMO,
    Permission.ACKNOWLEDGE_MEMO,
  ],
  [Role.INSTITUTION_ADMIN]: [
    Permission.MANAGE_TENANT_USERS,
    Permission.PROVISION_USERS_BULK,
    Permission.MANAGE_ROLES,
    Permission.VIEW_AUDIT_LOGS,
  ],
  [Role.HOD]: [Permission.BROADCAST_MEMO, Permission.ACKNOWLEDGE_MEMO],
  [Role.TRAINER]: [Permission.ACKNOWLEDGE_MEMO],
  [Role.TRAINEE]: [Permission.ACKNOWLEDGE_MEMO],
};
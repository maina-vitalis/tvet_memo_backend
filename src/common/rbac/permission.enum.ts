/** [RBAC] Fixed permission set — checked via ROLE_PERMISSIONS map, not database. */
export enum Permission {
  MANAGE_INSTITUTIONS = 'manage_institutions',
  MANAGE_TENANT_USERS = 'manage_tenant_users',
  PROVISION_USERS_BULK = 'provision_users_bulk',
  MANAGE_ROLES = 'manage_roles',
  BROADCAST_MEMO = 'broadcast_memo',
  APPROVE_MEMO = 'approve_memo',
  VIEW_AUDIT_LOGS = 'view_audit_logs',
  VIEW_BOARD_REPORTS = 'view_board_reports',
  ACKNOWLEDGE_MEMO = 'acknowledge_memo',
}
/** [RBAC] Fixed permission set — checked via ROLE_PERMISSIONS map, not database. */
export enum Permission {
  MANAGE_INSTITUTIONS = 'manage_institutions',
  MANAGE_OWN_INSTITUTION = 'manage_own_institution',
  MANAGE_TENANT_USERS = 'manage_tenant_users',
  PROVISION_USERS_BULK = 'provision_users_bulk',
  MANAGE_ROLES = 'manage_roles',
  BROADCAST_MEMO = 'broadcast_memo',
  APPROVE_MEMO = 'approve_memo',
  MANAGE_MEMOS = 'manage_memos',
  VIEW_AUDIT_LOGS = 'view_audit_logs',
  VIEW_BOARD_REPORTS = 'view_board_reports',
  ACKNOWLEDGE_MEMO = 'acknowledge_memo',
}

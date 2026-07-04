/** [MEMO TARGETING] Broadcast boundary scopes — separate from RBAC permissions. */
export enum MemoScope {
  SYSTEM_WIDE = 'system_wide',
  INSTITUTION_WIDE = 'institution_wide',
  BOARD = 'board',
  DEPARTMENT = 'department',
  COHORT = 'cohort',
}
import { Role } from './role.enum';
import { MemoScope } from './memo-scope.enum';

/** [MEMO TARGETING] Which scopes each role may select when broadcasting. */
export const MEMO_TARGETING_RULES: Record<Role, MemoScope[]> = {
  [Role.SUPER_ADMIN]: [MemoScope.SYSTEM_WIDE, MemoScope.INSTITUTION_WIDE],
  [Role.CHAIRPERSON]: [MemoScope.BOARD],
  [Role.BOARD_MEMBER]: [MemoScope.BOARD],
  [Role.PRINCIPAL]: [MemoScope.INSTITUTION_WIDE, MemoScope.BOARD],
  [Role.DEPUTY_PRINCIPAL_ACADEMICS]: [MemoScope.INSTITUTION_WIDE],
  [Role.DEPUTY_PRINCIPAL_ADMIN]: [MemoScope.INSTITUTION_WIDE],
  [Role.INSTITUTION_ADMIN]: [],
  [Role.HOD]: [MemoScope.DEPARTMENT],
  [Role.TRAINER]: [MemoScope.COHORT],
  [Role.TRAINEE]: [],
};

/** [MEMO TARGETING] Which roles each sender may reach within an allowed scope. */
export const ALLOWED_ROLE_TARGETS: Record<Role, Role[]> = {
  [Role.SUPER_ADMIN]: Object.values(Role),
  [Role.PRINCIPAL]: [
    Role.DEPUTY_PRINCIPAL_ACADEMICS,
    Role.DEPUTY_PRINCIPAL_ADMIN,
    Role.HOD,
    Role.TRAINER,
    Role.TRAINEE,
  ],
  [Role.DEPUTY_PRINCIPAL_ACADEMICS]: [Role.HOD, Role.TRAINER, Role.TRAINEE],
  [Role.DEPUTY_PRINCIPAL_ADMIN]: [Role.HOD, Role.TRAINER, Role.TRAINEE],
  [Role.CHAIRPERSON]: [Role.CHAIRPERSON, Role.BOARD_MEMBER, Role.PRINCIPAL],
  [Role.BOARD_MEMBER]: [Role.CHAIRPERSON, Role.BOARD_MEMBER],
  [Role.HOD]: [Role.TRAINER, Role.TRAINEE],
  [Role.TRAINER]: [Role.TRAINEE],
  [Role.INSTITUTION_ADMIN]: [],
  [Role.TRAINEE]: [],
};
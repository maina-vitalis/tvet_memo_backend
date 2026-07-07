import { Role } from './role.enum';

/** [RBAC] Numeric hierarchy for role-assignment ceiling comparisons. */
export const ROLE_RANK: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 100,
  [Role.INSTITUTION_ADMIN]: 90,
  [Role.PRINCIPAL]: 80,
  [Role.CHAIRPERSON]: 75,
  [Role.BOARD_MEMBER]: 72,
  [Role.DEPUTY_PRINCIPAL_ACADEMICS]: 70,
  [Role.DEPUTY_PRINCIPAL_ADMIN]: 70,
  [Role.HOD]: 50,
  [Role.TRAINER]: 30,
  [Role.TRAINEE]: 10,
};

import { Role } from './role.enum';

/** [RBAC] Numeric hierarchy for role-assignment ceiling comparisons. */
export const ROLE_RANK: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 100,
  [Role.CHAIRPERSON]: 90,
  [Role.BOARD_MEMBER]: 85,
  [Role.PRINCIPAL]: 80,
  [Role.DEPUTY_PRINCIPAL_ACADEMICS]: 70,
  [Role.DEPUTY_PRINCIPAL_ADMIN]: 70,
  [Role.INSTITUTION_ADMIN]: 65,
  [Role.HOD]: 50,
  [Role.TRAINER]: 30,
  [Role.TRAINEE]: 10,
};

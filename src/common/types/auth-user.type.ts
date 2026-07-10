import { Role } from '../rbac';

/** [AUTH] JWT payload — minimal claims; permissions resolved from ROLE_PERMISSIONS at guard time. */
export interface JwtPayload {
  sub: string;
  jti: string;
  role: Role;
  institutionId: string | null;
}

/** [AUTH] User attached to request after JwtStrategy validates the token. */
export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  role: Role;
  institutionId: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  departmentId: string | null;
  cohortId: string | null;
  mustChangePassword: boolean;
}

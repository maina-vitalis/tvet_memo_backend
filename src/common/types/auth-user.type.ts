export interface JwtPayload {
  sub: string;
  jti: string;
  institutionId: string;
  roleId: string;
  departmentId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
  // Future: we can embed permission keys if payload size allows
  // permissions?: string[];
}

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  institutionId: string;
  roleId: string;
  departmentId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
  // Populated by RBAC layer
  permissions?: string[];
}

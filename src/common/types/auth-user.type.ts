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
}

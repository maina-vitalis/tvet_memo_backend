export interface JwtPayload {
  sub: string;
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
  institutionId: string;
  roleId: string;
  departmentId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
}

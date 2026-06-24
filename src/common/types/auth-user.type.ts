export interface AuthenticatedUser {
  id: string;
  institutionId: string;
  roleId: string;
  departmentId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
  sessionId: string;
}

export interface SessionPayload {
  sessionId: string;
  userId: string;
  institutionId: string;
}

export interface SuperAdminJwtPayload {
  sub: string;
  jti: string;
  type: 'super-admin';
  email: string;
}

export interface AuthenticatedSuperAdmin {
  id: string;
  sessionId: string;
  email: string;
  // Platform RBAC permissions
  permissions?: string[];
}

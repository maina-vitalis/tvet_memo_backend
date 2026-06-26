export interface SuperAdminJwtPayload {
  sub: string;
  type: 'super-admin';
  email: string;
}

export interface AuthenticatedSuperAdmin {
  id: string;
  email: string;
}

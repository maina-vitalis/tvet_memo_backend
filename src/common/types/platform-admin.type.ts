export interface PlatformJwtPayload {
  sub: 'platform-admin';
  type: 'platform';
  email: string;
}

export interface PlatformAdmin {
  id: 'platform-admin';
  email: string;
}

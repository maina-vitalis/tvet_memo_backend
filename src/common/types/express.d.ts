import { AuthenticatedUser } from './auth-user.type';

declare global {
  namespace Express {
    // Augments Passport's default User type for JWT-authenticated requests.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AuthenticatedUser {}
  }
}

export {};

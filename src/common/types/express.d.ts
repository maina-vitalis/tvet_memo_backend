import { AuthenticatedUser } from './auth-user.type';

declare module 'express-session' {
  interface SessionData {
    auth?: {
      sessionId: string;
      userId: string;
      institutionId: string;
    };
  }
}

declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}

export {};

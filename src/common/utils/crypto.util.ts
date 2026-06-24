import { createHash, randomBytes } from 'crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sanitizeUser<T extends Record<string, unknown>>(user: T) {
  const { passwordHash, totpSecret, ...safe } = user;
  return safe;
}

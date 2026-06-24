import { createHash, randomBytes, randomUUID } from 'crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSessionId(): string {
  return randomUUID();
}

export function generateTemporaryPassword(length = 12): string {
  return randomBytes(length)
    .toString('base64url')
    .slice(0, length);
}

export function sanitizeUser<T extends Record<string, unknown>>(user: T) {
  const { passwordHash: _passwordHash, totpSecret: _totpSecret, ...safe } = user;
  return safe;
}

/* eslint-disable @typescript-eslint/no-unused-vars */
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as argon2 from 'argon2';

const LOCKED_PASSWORD_SENTINEL = '__ACCOUNT_SETUP_PENDING__';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSetupToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generateSessionId(): string {
  return randomUUID();
}

const MOCK_OTP_CODE = '123456';

export function generateOtp(): string {
  const configuredMockOtp = process.env.MOCK_OTP_CODE?.trim();

  if (configuredMockOtp) {
    return configuredMockOtp;
  }

  if (process.env.NODE_ENV === 'development') {
    return MOCK_OTP_CODE;
  }

  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateTemporaryPassword(length = 12): string {
  return randomBytes(length).toString('base64url').slice(0, length);
}

export async function getLockedPasswordHash(): Promise<string> {
  return argon2.hash(LOCKED_PASSWORD_SENTINEL, { type: argon2.argon2id });
}

export function sanitizeUser<T extends Record<string, unknown>>(user: T) {
  const {
    passwordHash: _passwordHash,
    totpSecret: _totpSecret,
    ...safe
  } = user;
  return safe;
}

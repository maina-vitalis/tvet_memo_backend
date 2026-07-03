/* eslint-disable @typescript-eslint/no-unused-vars */
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as argon2 from 'argon2';

const LOCKED_PASSWORD_SENTINEL = '__ACCOUNT_SETUP_PENDING__';

/**
 * [REFRESH TOKENS] One-way hash used for BOTH access token hashes and refresh token hashes.
 * Never store plaintext tokens in DB. SHA-256 is sufficient here (tokens are high entropy).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSetupToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generateSessionId(): string {
  return randomUUID();
}

/**
 * [REFRESH TOKENS] Generates a cryptographically strong opaque refresh token.
 * Using randomUUID for simplicity + high entropy. In production you could use 32+ random bytes.
 * This value is ONLY returned to the client once; server only ever sees/stores the hash.
 */
export function generateRefreshToken(): string {
  return randomUUID() + '-' + randomBytes(16).toString('hex');
}

/**
 * [REFRESH TOKENS] Convenience: generate a stable device identifier on the client side.
 * Recommended usage (clients): generate once per install/device and persist in secure storage.
 * Send as `deviceId` on login/refresh for better session visibility and targeted revocation.
 */
export function generateDeviceId(): string {
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

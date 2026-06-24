export function sanitizeUser<T extends Record<string, unknown>>(user: T) {
  const { passwordHash: _passwordHash, totpSecret: _totpSecret, ...safe } = user;
  return safe;
}

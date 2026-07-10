export function extractEmailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');

  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return null;
  }

  return normalized.slice(atIndex + 1);
}

export function deriveNamesFromEmail(email: string): {
  firstName: string;
  lastName: string;
} {
  const local = email.split('@')[0] ?? 'user';
  const parts = local.split(/[._-]+/).filter(Boolean);
  const capitalize = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

  if (parts.length >= 2) {
    return {
      firstName: capitalize(parts[0]),
      lastName: parts.slice(1).map(capitalize).join(' '),
    };
  }

  return { firstName: capitalize(local), lastName: 'User' };
}

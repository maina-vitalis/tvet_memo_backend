export function hasAdminPortalAccess(
  adminRights: Record<string, unknown> | null | undefined,
): boolean {
  if (!adminRights) {
    return false;
  }

  return Object.values(adminRights).some((value) => value === true);
}

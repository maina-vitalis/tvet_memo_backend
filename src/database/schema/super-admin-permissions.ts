import { pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { superAdmins } from './super-admins';
import { permissions } from './permissions';

/**
 * SUPER ADMIN PERMISSIONS (Platform level)
 *
 * Super admins operate across all tenants.
 * We assign them permissions directly (or via future super_admin_roles).
 *
 * This uses the SAME global permissions table.
 * We recommend only assigning permissions with category starting with "platform.*"
 * or explicitly platform-scoped ones.
 *
 * Why direct assignment instead of roles for super admins?
 * - Number of super admins is very small.
 * - Platform operations are sensitive and usually assigned individually.
 * - Keeps super admin auth flow completely separate from tenant roles.
 *
 * In future we can introduce super_admin_roles + super_admin_role_permissions if needed.
 */

export const superAdminPermissions = pgTable(
  'super_admin_permission',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    superAdminId: uuid('super_admin_id')
      .notNull()
      .references(() => superAdmins.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('super_admin_permission_unique').on(table.superAdminId, table.permissionId),
  ],
);

export type SuperAdminPermission = typeof superAdminPermissions.$inferSelect;
export type NewSuperAdminPermission = typeof superAdminPermissions.$inferInsert;

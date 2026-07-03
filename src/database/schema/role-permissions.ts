import { pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { roles } from './roles';
import { permissions } from './permissions';

/**
 * Junction table: Tenant Role ↔ Permission
 *
 * A role in an institution can be granted zero or more permissions from the global registry.
 * This replaces/augments the previous unstructured JSONB sendScope/contentAccess/adminRights.
 *
 * Multi-tenant safety:
 * - Role is already institution-scoped.
 * - Permission is global.
 * - No cross-tenant leakage possible.
 */

export const rolePermissions = pgTable(
  'role_permission',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('role_permission_unique').on(table.roleId, table.permissionId),
  ],
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;

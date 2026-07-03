import {
  boolean,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * GLOBAL PERMISSIONS REGISTRY
 *
 * This is the single source of truth for all possible actions/capabilities in the system.
 * Permissions are NOT tenant-scoped — they define what the platform supports.
 *
 * Naming convention (strict):
 *   <scope>.<resource>.<action>
 *
 * Scopes:
 *   - platform: Super admin / cross-tenant operations
 *   - tenant:  Operations within a single institution
 *
 * Examples:
 *   platform.institutions.create
 *   tenant.memos.send.broadcast
 *   tenant.users.manage
 *
 * Why a permissions table (instead of continuing with JSONB)?
 * - Centralized, queryable, type-safe list of capabilities.
 * - Easier UI (checkboxes, search).
 * - Auditability (who has what).
 * - Future: attribute-based or finer scoping.
 * - Prevents ad-hoc strings in roles.
 */

export const permissions = pgTable(
  'permission',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 150 }).notNull().unique(),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 50 }).notNull(), // 'platform' | 'tenant' | 'memos' etc.
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;

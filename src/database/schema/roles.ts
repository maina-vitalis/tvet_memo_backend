import {
  boolean,
  jsonb,
  pgTable,
  smallint,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { institutions } from './institutions';

export const roles = pgTable(
  'role',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id),
    name: varchar('name', { length: 100 }).notNull(),
    hierarchyLevel: smallint('hierarchy_level').notNull(),
    sendScope: jsonb('send_scope').notNull().default({}),
    contentAccess: jsonb('content_access').notNull().default({}),
    adminRights: jsonb('admin_rights').notNull().default({}),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique('role_institution_name_unique').on(table.institutionId, table.name)],
);

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

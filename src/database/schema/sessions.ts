import {
  boolean,
  check,
  inet,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { sessionActorTypeEnum } from './enums';
import { superAdmins } from './super-admins';
import { users } from './users';

export const sessions = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: sessionActorTypeEnum('actor_type').notNull().default('user'),
    userId: uuid('user_id').references(() => users.id),
    superAdminId: uuid('super_admin_id').references(() => superAdmins.id),
    tokenHash: text('token_hash').notNull().unique(),
    deviceName: varchar('device_name', { length: 150 }),
    deviceType: varchar('device_type', { length: 20 }),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    isActive: boolean('is_active').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'session_actor_fk_check',
      sql`(
        ${table.actorType} = 'user'
        AND ${table.userId} IS NOT NULL
        AND ${table.superAdminId} IS NULL
      ) OR (
        ${table.actorType} = 'super_admin'
        AND ${table.superAdminId} IS NOT NULL
        AND ${table.userId} IS NULL
      )`,
    ),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

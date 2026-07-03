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

/**
 * [REFRESH TOKENS + SESSION HARDENING]
 * Extended session table to support short-lived access JWTs + revocable refresh tokens.
 *
 * Why extend this table (vs new refresh_tokens table)?
 * - Keeps device, ip, user-agent, actor metadata together in one row (easier "active sessions" admin view).
 * - Simpler initial migration.
 * - Refresh token is now the long-lived revocable credential. Access JWT is short and mostly stateless.
 *
 * New columns:
 * - refreshTokenHash: SHA256 hash of the refresh token (never store plaintext). Unique.
 * - refreshExpiresAt: separate longer expiry for the refresh credential.
 * - deviceId: stable client-provided identifier (uuid recommended). Enables "sign out this device".
 *
 * tokenHash remains (now for the latest issued access token) for potential immediate revocation or audit.
 * On logout we mark the whole session inactive (invalidates both access usage via session check + refresh).
 *
 * IMPORTANT FOR REVIEW: After this change, run `cd memo_backend && pnpm drizzle-kit generate`
 * to create the migration. Existing rows will have NULL for new columns until updated on next login.
 */
export const sessions = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: sessionActorTypeEnum('actor_type').notNull().default('user'),
    userId: uuid('user_id').references(() => users.id),
    superAdminId: uuid('super_admin_id').references(() => superAdmins.id),
    // Hash of the CURRENT access JWT (short-lived). Used for fast revocation checks.
    tokenHash: text('token_hash').notNull().unique(),
    // NEW: Hash of the refresh token (primary revocable credential).
    refreshTokenHash: text('refresh_token_hash').unique(),
    deviceName: varchar('device_name', { length: 150 }),
    deviceType: varchar('device_type', { length: 20 }),
    // NEW: Client-generated stable device identifier (e.g. uuid stored in secure storage on RN).
    deviceId: varchar('device_id', { length: 128 }),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    isActive: boolean('is_active').notNull().default(true),
    // Expiry of the access token (short).
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // NEW: Separate longer expiry for the refresh token.
    refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Optional: track when this session/refresh was last successfully used for refresh.
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
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

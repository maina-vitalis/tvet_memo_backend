import {
  boolean,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const userPushTokens = pgTable(
  'user_push_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    deviceId: varchar('device_id', { length: 128 }),
    deviceName: varchar('device_name', { length: 150 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => [
    unique('user_push_token_user_device_unique').on(
      table.userId,
      table.deviceId,
    ),
  ],
);

export type UserPushToken = typeof userPushTokens.$inferSelect;
export type NewUserPushToken = typeof userPushTokens.$inferInsert;

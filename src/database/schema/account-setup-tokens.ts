import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { institutions } from './institutions';
import { users } from './users';

export const accountSetupTokens = pgTable('account_setup_token', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AccountSetupToken = typeof accountSetupTokens.$inferSelect;
export type NewAccountSetupToken = typeof accountSetupTokens.$inferInsert;

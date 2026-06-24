import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { institutions } from './institutions';
import { memos } from './memos';
import { users } from './users';

export const messageThreads = pgTable('message_thread', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id),
  memoId: uuid('memo_id')
    .notNull()
    .references(() => memos.id),
  senderId: uuid('sender_id')
    .notNull()
    .references(() => users.id),
  recipientId: uuid('recipient_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MessageThread = typeof messageThreads.$inferSelect;
export type NewMessageThread = typeof messageThreads.$inferInsert;

import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { ackTypeEnum } from './enums';
import { memos } from './memos';
import { users } from './users';

export const memoRecipients = pgTable(
  'memo_recipient',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memoId: uuid('memo_id')
      .notNull()
      .references(() => memos.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    ackType: ackTypeEnum('ack_type'),
    ackReply: text('ack_reply'),
  },
  (table) => [
    unique('memo_recipient_memo_user_unique').on(table.memoId, table.userId),
  ],
);

export type MemoRecipient = typeof memoRecipients.$inferSelect;
export type NewMemoRecipient = typeof memoRecipients.$inferInsert;

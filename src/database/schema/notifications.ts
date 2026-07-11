import { pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { notificationChannelEnum, notificationStatusEnum } from './enums';
import { institutions } from './institutions';
import { memos } from './memos';
import { users } from './users';

export const notifications = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    memoId: uuid('memo_id')
      .notNull()
      .references(() => memos.id),
    channel: notificationChannelEnum('channel').notNull(),
    status: notificationStatusEnum('status').notNull().default('pending'),
    retryCount: smallint('retry_count').notNull().default(0),
    errorMessage: text('error_message'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('notification_user_memo_channel_unique').on(
      table.userId,
      table.memoId,
      table.channel,
    ),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

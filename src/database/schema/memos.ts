import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  memoCategoryEnum,
  memoPriorityEnum,
  memoStatusEnum,
  memoTargetTypeEnum,
} from './enums';
import { institutions } from './institutions';
import { users } from './users';

export const memos = pgTable('memo', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id),
  senderId: uuid('sender_id')
    .notNull()
    .references(() => users.id),
  subject: varchar('subject', { length: 255 }).notNull(),
  body: text('body').notNull(),
  bodyFormat: varchar('body_format', { length: 16 }).notNull().default('plain'),
  priority: memoPriorityEnum('priority').notNull().default('normal'),
  category: memoCategoryEnum('category').notNull(),
  status: memoStatusEnum('status').notNull().default('draft'),
  targetType: memoTargetTypeEnum('target_type').notNull(),
  targetPayload: jsonb('target_payload').notNull().default({}),
  requiresAck: boolean('requires_ack').notNull().default(false),
  ackDeadlineAt: timestamp('ack_deadline_at', { withTimezone: true }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Memo = typeof memos.$inferSelect;
export type NewMemo = typeof memos.$inferInsert;

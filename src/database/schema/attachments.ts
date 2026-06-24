import {
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { memos } from './memos';
import { users } from './users';

export const attachments = pgTable('attachment', {
  id: uuid('id').primaryKey().defaultRandom(),
  memoId: uuid('memo_id')
    .notNull()
    .references(() => memos.id),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  originalFilename: varchar('original_filename', { length: 255 }).notNull(),
  storageKey: text('storage_key').notNull().unique(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  version: smallint('version').notNull().default(1),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;

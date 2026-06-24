import { relations } from 'drizzle-orm';
import { institutions } from './institutions';
import { roles } from './roles';
import { departments } from './departments';
import { users } from './users';
import { sessions } from './sessions';
import { memos } from './memos';
import { memoRecipients } from './memo-recipients';
import { attachments } from './attachments';
import { notifications } from './notifications';
import { messageThreads } from './message-threads';
import { auditLogs } from './audit-logs';

export const institutionsRelations = relations(institutions, ({ many }) => ({
  roles: many(roles),
  departments: many(departments),
  users: many(users),
  memos: many(memos),
  auditLogs: many(auditLogs),
  notifications: many(notifications),
  messageThreads: many(messageThreads),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [roles.institutionId],
    references: [institutions.id],
  }),
  users: many(users),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [departments.institutionId],
    references: [institutions.id],
  }),
  head: one(users, {
    fields: [departments.headUserId],
    references: [users.id],
  }),
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [users.institutionId],
    references: [institutions.id],
  }),
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
  }),
  sessions: many(sessions),
  sentMemos: many(memos),
  memoRecipients: many(memoRecipients),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const memosRelations = relations(memos, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [memos.institutionId],
    references: [institutions.id],
  }),
  sender: one(users, {
    fields: [memos.senderId],
    references: [users.id],
  }),
  recipients: many(memoRecipients),
  attachments: many(attachments),
  notifications: many(notifications),
  messageThreads: many(messageThreads),
}));

export const memoRecipientsRelations = relations(memoRecipients, ({ one }) => ({
  memo: one(memos, {
    fields: [memoRecipients.memoId],
    references: [memos.id],
  }),
  user: one(users, {
    fields: [memoRecipients.userId],
    references: [users.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  memo: one(memos, {
    fields: [attachments.memoId],
    references: [memos.id],
  }),
  uploader: one(users, {
    fields: [attachments.uploadedBy],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  institution: one(institutions, {
    fields: [notifications.institutionId],
    references: [institutions.id],
  }),
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  memo: one(memos, {
    fields: [notifications.memoId],
    references: [memos.id],
  }),
}));

export const messageThreadsRelations = relations(messageThreads, ({ one }) => ({
  institution: one(institutions, {
    fields: [messageThreads.institutionId],
    references: [institutions.id],
  }),
  memo: one(memos, {
    fields: [messageThreads.memoId],
    references: [memos.id],
  }),
  sender: one(users, {
    fields: [messageThreads.senderId],
    references: [users.id],
  }),
  recipient: one(users, {
    fields: [messageThreads.recipientId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  institution: one(institutions, {
    fields: [auditLogs.institutionId],
    references: [institutions.id],
  }),
  actor: one(users, {
    fields: [auditLogs.actorId],
    references: [users.id],
  }),
}));

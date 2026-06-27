import { relations } from 'drizzle-orm/relations';
import {
  institution,
  role,
  user,
  accountSetupToken,
  department,
  session,
  otp,
  memo,
  memoRecipient,
  attachment,
  notification,
  messageThread,
  auditLog,
} from './schema';

export const roleRelations = relations(role, ({ one, many }) => ({
  institution: one(institution, {
    fields: [role.institutionId],
    references: [institution.id],
  }),
  users: many(user),
}));

export const institutionRelations = relations(institution, ({ many }) => ({
  roles: many(role),
  users: many(user),
  accountSetupTokens: many(accountSetupToken),
  departments: many(department),
  otps: many(otp),
  memos: many(memo),
  notifications: many(notification),
  messageThreads: many(messageThread),
  auditLogs: many(auditLog),
}));

export const userRelations = relations(user, ({ one, many }) => ({
  institution: one(institution, {
    fields: [user.institutionId],
    references: [institution.id],
  }),
  role: one(role, {
    fields: [user.roleId],
    references: [role.id],
  }),
  accountSetupTokens: many(accountSetupToken),
  departments: many(department),
  sessions: many(session),
  memos: many(memo),
  memoRecipients: many(memoRecipient),
  attachments: many(attachment),
  notifications: many(notification),
  messageThreads_senderId: many(messageThread, {
    relationName: 'messageThread_senderId_user_id',
  }),
  messageThreads_recipientId: many(messageThread, {
    relationName: 'messageThread_recipientId_user_id',
  }),
  auditLogs: many(auditLog),
}));

export const accountSetupTokenRelations = relations(
  accountSetupToken,
  ({ one }) => ({
    institution: one(institution, {
      fields: [accountSetupToken.institutionId],
      references: [institution.id],
    }),
    user: one(user, {
      fields: [accountSetupToken.userId],
      references: [user.id],
    }),
  }),
);

export const departmentRelations = relations(department, ({ one }) => ({
  institution: one(institution, {
    fields: [department.institutionId],
    references: [institution.id],
  }),
  user: one(user, {
    fields: [department.headUserId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const otpRelations = relations(otp, ({ one }) => ({
  institution: one(institution, {
    fields: [otp.institutionId],
    references: [institution.id],
  }),
}));

export const memoRelations = relations(memo, ({ one, many }) => ({
  institution: one(institution, {
    fields: [memo.institutionId],
    references: [institution.id],
  }),
  user: one(user, {
    fields: [memo.senderId],
    references: [user.id],
  }),
  memoRecipients: many(memoRecipient),
  attachments: many(attachment),
  notifications: many(notification),
  messageThreads: many(messageThread),
}));

export const memoRecipientRelations = relations(memoRecipient, ({ one }) => ({
  memo: one(memo, {
    fields: [memoRecipient.memoId],
    references: [memo.id],
  }),
  user: one(user, {
    fields: [memoRecipient.userId],
    references: [user.id],
  }),
}));

export const attachmentRelations = relations(attachment, ({ one }) => ({
  memo: one(memo, {
    fields: [attachment.memoId],
    references: [memo.id],
  }),
  user: one(user, {
    fields: [attachment.uploadedBy],
    references: [user.id],
  }),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  institution: one(institution, {
    fields: [notification.institutionId],
    references: [institution.id],
  }),
  user: one(user, {
    fields: [notification.userId],
    references: [user.id],
  }),
  memo: one(memo, {
    fields: [notification.memoId],
    references: [memo.id],
  }),
}));

export const messageThreadRelations = relations(messageThread, ({ one }) => ({
  institution: one(institution, {
    fields: [messageThread.institutionId],
    references: [institution.id],
  }),
  memo: one(memo, {
    fields: [messageThread.memoId],
    references: [memo.id],
  }),
  user_senderId: one(user, {
    fields: [messageThread.senderId],
    references: [user.id],
    relationName: 'messageThread_senderId_user_id',
  }),
  user_recipientId: one(user, {
    fields: [messageThread.recipientId],
    references: [user.id],
    relationName: 'messageThread_recipientId_user_id',
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  institution: one(institution, {
    fields: [auditLog.institutionId],
    references: [institution.id],
  }),
  user: one(user, {
    fields: [auditLog.actorId],
    references: [user.id],
  }),
}));

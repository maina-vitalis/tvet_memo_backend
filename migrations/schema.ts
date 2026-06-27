import {
  pgTable,
  unique,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  char,
  foreignKey,
  smallint,
  jsonb,
  inet,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const ackTypeEnum = pgEnum('ack_type_enum', ['simple', 'reply']);
export const institutionPlan = pgEnum('institution_plan', [
  'trial',
  'basic',
  'pro',
]);
export const institutionStatus = pgEnum('institution_status', [
  'trial',
  'active',
  'pending',
  'suspended',
]);
export const memoCategory = pgEnum('memo_category', [
  'general',
  'academic',
  'administrative',
  'emergency',
  'event',
]);
export const memoPriority = pgEnum('memo_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);
export const memoStatus = pgEnum('memo_status', [
  'draft',
  'scheduled',
  'sent',
  'archived',
  'cancelled',
]);
export const memoTargetType = pgEnum('memo_target_type', [
  'broadcast',
  'department',
  'role',
  'individual',
]);
export const notificationChannel = pgEnum('notification_channel', [
  'fcm',
  'smtp',
]);
export const notificationStatus = pgEnum('notification_status', [
  'pending',
  'sent',
  'failed',
  'retrying',
]);

export const superAdmin = pgTable(
  'super_admin',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar({ length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    lastLoginAt: timestamp('last_login_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique('super_admin_email_unique').on(table.email)],
);

export const institution = pgTable(
  'institution',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    subdomain: varchar({ length: 100 }).notNull(),
    schoolCode: varchar('school_code', { length: 50 }).notNull(),
    plan: institutionPlan().default('trial').notNull(),
    status: institutionStatus().default('pending').notNull(),
    logoUrl: text('logo_url'),
    contactEmail: varchar('contact_email', { length: 255 }).notNull(),
    seatQuota: integer('seat_quota').default(500).notNull(),
    subscriptionEndsAt: timestamp('subscription_ends_at', {
      withTimezone: true,
      mode: 'string',
    }),
    provisioningNotes: text('provisioning_notes'),
    countryCode: char('country_code', { length: 2 }).default('KE').notNull(),
    timezone: varchar({ length: 64 }).default('Africa/Nairobi').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('institution_subdomain_unique').on(table.subdomain),
    unique('institution_school_code_unique').on(table.schoolCode),
  ],
);

export const role = pgTable(
  'role',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    institutionId: uuid('institution_id').notNull(),
    name: varchar({ length: 100 }).notNull(),
    hierarchyLevel: smallint('hierarchy_level').notNull(),
    sendScope: jsonb('send_scope').default({}).notNull(),
    contentAccess: jsonb('content_access').default({}).notNull(),
    adminRights: jsonb('admin_rights').default({}).notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.institutionId],
      foreignColumns: [institution.id],
      name: 'role_institution_id_institution_id_fk',
    }),
    unique('role_institution_name_unique').on(table.name, table.institutionId),
  ],
);

export const user = pgTable(
  'user',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    institutionId: uuid('institution_id').notNull(),
    roleId: uuid('role_id').notNull(),
    departmentId: uuid('department_id'),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar({ length: 255 }).notNull(),
    admissionNumber: varchar('admission_number', { length: 50 }),
    staffNumber: varchar('staff_number', { length: 50 }),
    phoneNumber: varchar('phone_number', { length: 20 }),
    passwordHash: text('password_hash').notNull(),
    totpSecret: text('totp_secret'),
    totpEnabled: boolean('totp_enabled').default(false).notNull(),
    fcmToken: text('fcm_token'),
    preferredLang: char('preferred_lang', { length: 2 })
      .default('en')
      .notNull(),
    avatarUrl: text('avatar_url'),
    isActive: boolean('is_active').default(true).notNull(),
    mustChangePassword: boolean('must_change_password').default(true).notNull(),
    lastLoginAt: timestamp('last_login_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.institutionId],
      foreignColumns: [institution.id],
      name: 'user_institution_id_institution_id_fk',
    }),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [role.id],
      name: 'user_role_id_role_id_fk',
    }),
    unique('user_institution_email_unique').on(
      table.institutionId,
      table.email,
    ),
    unique('user_institution_staff_number_unique').on(
      table.staffNumber,
      table.institutionId,
    ),
    unique('user_institution_admission_number_unique').on(
      table.institutionId,
      table.admissionNumber,
    ),
  ],
);

export const accountSetupToken = pgTable(
  'account_setup_token',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    institutionId: uuid('institution_id').notNull(),
    userId: uuid('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.institutionId],
      foreignColumns: [institution.id],
      name: 'account_setup_token_institution_id_institution_id_fk',
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: 'account_setup_token_user_id_user_id_fk',
    }),
    unique('account_setup_token_token_hash_unique').on(table.tokenHash),
  ],
);

export const department = pgTable(
  'department',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    institutionId: uuid('institution_id').notNull(),
    name: varchar({ length: 150 }).notNull(),
    code: varchar({ length: 20 }),
    headUserId: uuid('head_user_id'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.institutionId],
      foreignColumns: [institution.id],
      name: 'department_institution_id_institution_id_fk',
    }),
    foreignKey({
      columns: [table.headUserId],
      foreignColumns: [user.id],
      name: 'department_head_user_id_user_id_fk',
    }),
    unique('department_institution_name_unique').on(
      table.name,
      table.institutionId,
    ),
  ],
);

export const session = pgTable(
  'session',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    deviceName: varchar('device_name', { length: 150 }),
    deviceType: varchar('device_type', { length: 20 }),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    isActive: boolean('is_active').default(true).notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: 'session_user_id_user_id_fk',
    }),
    unique('session_token_hash_unique').on(table.tokenHash),
  ],
);

export const otp = pgTable(
  'otp',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    institutionId: uuid('institution_id').notNull(),
    email: varchar({ length: 255 }).notNull(),
    code: varchar({ length: 6 }).notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    used: boolean().default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.institutionId],
      foreignColumns: [institution.id],
      name: 'otp_institution_id_institution_id_fk',
    }),
  ],
);

export const memo = pgTable(
  'memo',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    institutionId: uuid('institution_id').notNull(),
    senderId: uuid('sender_id').notNull(),
    subject: varchar({ length: 255 }).notNull(),
    body: text().notNull(),
    priority: memoPriority().default('normal').notNull(),
    category: memoCategory().notNull(),
    status: memoStatus().default('draft').notNull(),
    targetType: memoTargetType('target_type').notNull(),
    targetPayload: jsonb('target_payload').default({}).notNull(),
    requiresAck: boolean('requires_ack').default(false).notNull(),
    ackDeadlineAt: timestamp('ack_deadline_at', {
      withTimezone: true,
      mode: 'string',
    }),
    scheduledAt: timestamp('scheduled_at', {
      withTimezone: true,
      mode: 'string',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.institutionId],
      foreignColumns: [institution.id],
      name: 'memo_institution_id_institution_id_fk',
    }),
    foreignKey({
      columns: [table.senderId],
      foreignColumns: [user.id],
      name: 'memo_sender_id_user_id_fk',
    }),
  ],
);

export const memoRecipient = pgTable(
  'memo_recipient',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    memoId: uuid('memo_id').notNull(),
    userId: uuid('user_id').notNull(),
    deliveredAt: timestamp('delivered_at', {
      withTimezone: true,
      mode: 'string',
    }),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
    acknowledgedAt: timestamp('acknowledged_at', {
      withTimezone: true,
      mode: 'string',
    }),
    ackType: ackTypeEnum('ack_type'),
    ackReply: text('ack_reply'),
  },
  (table) => [
    foreignKey({
      columns: [table.memoId],
      foreignColumns: [memo.id],
      name: 'memo_recipient_memo_id_memo_id_fk',
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: 'memo_recipient_user_id_user_id_fk',
    }),
    unique('memo_recipient_memo_user_unique').on(table.userId, table.memoId),
  ],
);

export const attachment = pgTable(
  'attachment',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    memoId: uuid('memo_id').notNull(),
    uploadedBy: uuid('uploaded_by').notNull(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    version: smallint().default(1).notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.memoId],
      foreignColumns: [memo.id],
      name: 'attachment_memo_id_memo_id_fk',
    }),
    foreignKey({
      columns: [table.uploadedBy],
      foreignColumns: [user.id],
      name: 'attachment_uploaded_by_user_id_fk',
    }),
    unique('attachment_storage_key_unique').on(table.storageKey),
  ],
);

export const notification = pgTable(
  'notification',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    institutionId: uuid('institution_id').notNull(),
    userId: uuid('user_id').notNull(),
    memoId: uuid('memo_id').notNull(),
    channel: notificationChannel().notNull(),
    status: notificationStatus().default('pending').notNull(),
    retryCount: smallint('retry_count').default(0).notNull(),
    errorMessage: text('error_message'),
    scheduledAt: timestamp('scheduled_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.institutionId],
      foreignColumns: [institution.id],
      name: 'notification_institution_id_institution_id_fk',
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: 'notification_user_id_user_id_fk',
    }),
    foreignKey({
      columns: [table.memoId],
      foreignColumns: [memo.id],
      name: 'notification_memo_id_memo_id_fk',
    }),
  ],
);

export const messageThread = pgTable(
  'message_thread',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    institutionId: uuid('institution_id').notNull(),
    memoId: uuid('memo_id').notNull(),
    senderId: uuid('sender_id').notNull(),
    recipientId: uuid('recipient_id').notNull(),
    body: text().notNull(),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.institutionId],
      foreignColumns: [institution.id],
      name: 'message_thread_institution_id_institution_id_fk',
    }),
    foreignKey({
      columns: [table.memoId],
      foreignColumns: [memo.id],
      name: 'message_thread_memo_id_memo_id_fk',
    }),
    foreignKey({
      columns: [table.senderId],
      foreignColumns: [user.id],
      name: 'message_thread_sender_id_user_id_fk',
    }),
    foreignKey({
      columns: [table.recipientId],
      foreignColumns: [user.id],
      name: 'message_thread_recipient_id_user_id_fk',
    }),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    institutionId: uuid('institution_id').notNull(),
    actorId: uuid('actor_id'),
    action: varchar({ length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.institutionId],
      foreignColumns: [institution.id],
      name: 'audit_log_institution_id_institution_id_fk',
    }),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [user.id],
      name: 'audit_log_actor_id_user_id_fk',
    }),
  ],
);

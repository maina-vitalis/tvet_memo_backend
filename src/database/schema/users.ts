import {
  boolean,
  char,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { institutions } from './institutions';
import { roles } from './roles';

export const users = pgTable(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    departmentId: uuid('department_id'),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    admissionNumber: varchar('admission_number', { length: 50 }),
    staffNumber: varchar('staff_number', { length: 50 }),
    phoneNumber: varchar('phone_number', { length: 20 }),
    passwordHash: text('password_hash').notNull(),
    totpSecret: text('totp_secret'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    fcmToken: text('fcm_token'),
    preferredLang: char('preferred_lang', { length: 2 })
      .notNull()
      .default('en'),
    avatarUrl: text('avatar_url'),
    isActive: boolean('is_active').notNull().default(true),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('user_institution_email_unique').on(
      table.institutionId,
      table.email,
    ),
    unique('user_institution_staff_number_unique').on(
      table.institutionId,
      table.staffNumber,
    ),
    unique('user_institution_admission_number_unique').on(
      table.institutionId,
      table.admissionNumber,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

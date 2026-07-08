import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { roleEnum } from './enums';
import { institutions } from './institutions';

/**
 * [AUTH] Unified users table — all roles including SUPER_ADMIN.
 * SUPER_ADMIN has institutionId = NULL; all other roles require it.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull(),
    institutionId: uuid('institution_id').references(() => institutions.id),
    departmentId: uuid('department_id'),
    cohortId: uuid('cohort_id'),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    admissionNumber: varchar('admission_number', { length: 50 }),
    staffNumber: varchar('staff_number', { length: 50 }),
    phoneNumber: varchar('phone_number', { length: 20 }),
    totpSecret: text('totp_secret'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
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
    check(
      'role_institution_consistency',
      sql`(
        (${table.role} = 'SUPER_ADMIN' AND ${table.institutionId} IS NULL) OR
        (${table.role} != 'SUPER_ADMIN' AND ${table.institutionId} IS NOT NULL)
      )`,
    ),
    unique('users_institution_staff_number_unique').on(
      table.institutionId,
      table.staffNumber,
    ),
    unique('users_institution_admission_number_unique').on(
      table.institutionId,
      table.admissionNumber,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
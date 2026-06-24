import {
  boolean,
  char,
  pgTable,
  timestamp,
  uuid,
  varchar,
  text,
} from 'drizzle-orm/pg-core';
import { institutionPlanEnum } from './enums';

export const institutions = pgTable('institution', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  subdomain: varchar('subdomain', { length: 100 }).notNull().unique(),
  plan: institutionPlanEnum('plan').notNull().default('trial'),
  logoUrl: text('logo_url'),
  contactEmail: varchar('contact_email', { length: 255 }).notNull(),
  countryCode: char('country_code', { length: 2 }).notNull().default('KE'),
  timezone: varchar('timezone', { length: 64 })
    .notNull()
    .default('Africa/Nairobi'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Institution = typeof institutions.$inferSelect;
export type NewInstitution = typeof institutions.$inferInsert;

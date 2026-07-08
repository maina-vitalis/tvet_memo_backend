import { pgEnum } from 'drizzle-orm/pg-core';

export const memoPriorityEnum = pgEnum('memo_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);

export const memoCategoryEnum = pgEnum('memo_category', [
  'general',
  'academic',
  'administrative',
  'emergency',
  'event',
]);

export const memoStatusEnum = pgEnum('memo_status', [
  'draft',
  'scheduled',
  'sent',
  'archived',
  'cancelled',
]);

export const memoTargetTypeEnum = pgEnum('memo_target_type', [
  'broadcast',
  'department',
  'role',
  'individual',
]);

export const ackTypeEnum = pgEnum('ack_type_enum', ['simple', 'reply']);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'push',
  'smtp',
]);

export const notificationStatusEnum = pgEnum('notification_status', [
  'pending',
  'sent',
  'failed',
  'retrying',
]);

export const institutionPlanEnum = pgEnum('institution_plan', [
  'trial',
  'basic',
  'pro',
]);

export const institutionStatusEnum = pgEnum('institution_status', [
  'trial',
  'active',
  'pending',
  'suspended',
]);

/** [RBAC] Fixed user roles — no dynamic roles table. */
export const roleEnum = pgEnum('user_role', [
  'SUPER_ADMIN',
  'CHAIRPERSON',
  'BOARD_MEMBER',
  'PRINCIPAL',
  'DEPUTY_PRINCIPAL_ACADEMICS',
  'DEPUTY_PRINCIPAL_ADMIN',
  'INSTITUTION_ADMIN',
  'HOD',
  'TRAINER',
  'TRAINEE',
]);

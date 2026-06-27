import * as argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import {
  getLockedPasswordHash,
  hashToken,
} from '../../common/utils/crypto.util';
import { DrizzleDB } from '../drizzle';
import {
  accountSetupTokens,
  attachments,
  auditLogs,
  departments,
  institutions,
  memoRecipients,
  memos,
  messageThreads,
  notifications,
  otps,
  roles,
  sessions,
  users,
} from '../schema';
import { DEFAULT_ROLES } from './default-roles';
import {
  DEMO_DEFAULT_PASSWORD,
  DEMO_DEPARTMENTS,
  DEMO_INSTITUTION,
  DEMO_MEMOS,
  DEMO_PASSWORD_ENV,
  DEMO_SESSION_TOKEN,
  DEMO_SETUP_TOKEN,
  DEMO_USERS,
  SEED_MARKER,
} from './fixtures';

type IdMap = Record<string, string>;

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

async function resolvePassword(pendingSetup?: boolean): Promise<string> {
  if (pendingSetup) {
    return getLockedPasswordHash();
  }
  const plain =
    process.env[DEMO_PASSWORD_ENV]?.trim() || DEMO_DEFAULT_PASSWORD;
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function seedDemoData(db: DrizzleDB) {
  const password = await resolvePassword();
  const institutionId = await ensureInstitution(db);
  const roleIds = await ensureRoles(db, institutionId);
  const departmentIds = await ensureDepartments(db, institutionId);
  const userIds = await ensureUsers(
    db,
    institutionId,
    roleIds,
    departmentIds,
    password,
  );
  await assignDepartmentHeads(db, userIds, departmentIds);
  await ensureAccountSetupToken(db, institutionId, userIds);
  await ensureSession(db, userIds);
  await ensureOtp(db, institutionId);
  const memoIds = await ensureMemos(
    db,
    institutionId,
    userIds,
    roleIds,
    departmentIds,
  );
  await ensureMemoRecipients(db, memoIds, userIds);
  await ensureAttachments(db, memoIds, userIds);
  await ensureNotifications(db, institutionId, memoIds, userIds);
  await ensureMessageThreads(db, institutionId, memoIds, userIds);
  await ensureAuditLogs(db, institutionId, userIds);

  return { institutionId, userIds, memoIds };
}

async function ensureInstitution(db: DrizzleDB): Promise<string> {
  const [existing] = await db
    .select({ id: institutions.id })
    .from(institutions)
    .where(eq(institutions.schoolCode, DEMO_INSTITUTION.schoolCode))
    .limit(1);

  if (existing) {
    console.log(`  institution: exists (${DEMO_INSTITUTION.schoolCode})`);
    return existing.id;
  }

  const [created] = await db
    .insert(institutions)
    .values({
      name: DEMO_INSTITUTION.name,
      subdomain: DEMO_INSTITUTION.subdomain,
      schoolCode: DEMO_INSTITUTION.schoolCode,
      contactEmail: DEMO_INSTITUTION.contactEmail,
      plan: DEMO_INSTITUTION.plan,
      status: DEMO_INSTITUTION.status,
      seatQuota: DEMO_INSTITUTION.seatQuota,
      subscriptionEndsAt: daysFromNow(365),
    })
    .returning({ id: institutions.id });

  console.log(`  institution: created (${DEMO_INSTITUTION.name})`);
  return created.id;
}

async function ensureRoles(
  db: DrizzleDB,
  institutionId: string,
): Promise<IdMap> {
  const existing = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(eq(roles.institutionId, institutionId));

  if (existing.length > 0) {
    console.log(`  roles: ${existing.length} exist`);
    return Object.fromEntries(existing.map((r) => [r.name, r.id]));
  }

  const inserted = await db
    .insert(roles)
    .values(
      DEFAULT_ROLES.map((role) => ({
        ...role,
        institutionId,
      })),
    )
    .returning({ id: roles.id, name: roles.name });

  console.log(`  roles: created ${inserted.length}`);
  return Object.fromEntries(inserted.map((r) => [r.name, r.id]));
}

async function ensureDepartments(
  db: DrizzleDB,
  institutionId: string,
): Promise<IdMap> {
  const ids: IdMap = {};

  for (const dept of DEMO_DEPARTMENTS) {
    const [existing] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(
        and(
          eq(departments.institutionId, institutionId),
          eq(departments.name, dept.name),
        ),
      )
      .limit(1);

    if (existing) {
      ids[dept.code] = existing.id;
      continue;
    }

    const [created] = await db
      .insert(departments)
      .values({
        institutionId,
        name: dept.name,
        code: dept.code,
      })
      .returning({ id: departments.id });

    ids[dept.code] = created.id;
  }

  console.log(`  departments: ${Object.keys(ids).length} ready`);
  return ids;
}

async function ensureUsers(
  db: DrizzleDB,
  institutionId: string,
  roleIds: IdMap,
  departmentIds: IdMap,
  defaultPasswordHash: string,
): Promise<IdMap> {
  const ids: IdMap = {};

  for (const fixture of DEMO_USERS) {
    const roleId = roleIds[fixture.roleName];
    if (!roleId) {
      throw new Error(`Role not found for seed user: ${fixture.roleName}`);
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.institutionId, institutionId),
          eq(users.email, fixture.email.toLowerCase()),
        ),
      )
      .limit(1);

    const passwordHash = fixture.pendingSetup
      ? await resolvePassword(true)
      : defaultPasswordHash;

    const departmentId = fixture.departmentCode
      ? departmentIds[fixture.departmentCode]
      : undefined;

    if (existing) {
      ids[fixture.key] = existing.id;
      continue;
    }

    const [created] = await db
      .insert(users)
      .values({
        institutionId,
        roleId,
        departmentId,
        firstName: fixture.firstName,
        lastName: fixture.lastName,
        email: fixture.email.toLowerCase(),
        staffNumber: fixture.staffNumber,
        admissionNumber: fixture.admissionNumber,
        passwordHash,
        mustChangePassword: fixture.mustChangePassword ?? false,
        phoneNumber: '+254700000000',
      })
      .returning({ id: users.id });

    ids[fixture.key] = created.id;
  }

  console.log(`  users: ${Object.keys(ids).length} ready`);
  return ids;
}

async function assignDepartmentHeads(
  db: DrizzleDB,
  userIds: IdMap,
  departmentIds: IdMap,
) {
  const hodId = userIds['hod-ict'];
  const ictDeptId = departmentIds['ICT'];
  if (!hodId || !ictDeptId) return;

  await db
    .update(departments)
    .set({ headUserId: hodId })
    .where(eq(departments.id, ictDeptId));
}

async function ensureAccountSetupToken(
  db: DrizzleDB,
  institutionId: string,
  userIds: IdMap,
) {
  const userId = userIds['pending-setup'];
  if (!userId) return;

  const tokenHash = hashToken(DEMO_SETUP_TOKEN);

  const [existing] = await db
    .select({ id: accountSetupTokens.id })
    .from(accountSetupTokens)
    .where(eq(accountSetupTokens.tokenHash, tokenHash))
    .limit(1);

  if (existing) {
    console.log('  account_setup_token: exists');
    return;
  }

  await db.insert(accountSetupTokens).values({
    institutionId,
    userId,
    tokenHash,
    expiresAt: daysFromNow(3),
  });

  console.log('  account_setup_token: created');
}

async function ensureSession(db: DrizzleDB, userIds: IdMap) {
  const userId = userIds['principal'];
  if (!userId) return;

  const tokenHash = hashToken(DEMO_SESSION_TOKEN);

  const [existing] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (existing) {
    console.log('  session: exists');
    return;
  }

  await db.insert(sessions).values({
    actorType: 'user',
    userId,
    tokenHash,
    deviceName: 'Seed Demo Browser',
    deviceType: 'web',
    ipAddress: '127.0.0.1',
    userAgent: 'MemoSeed/1.0',
    expiresAt: daysFromNow(7),
  });

  console.log('  session: created');
}

async function ensureOtp(db: DrizzleDB, institutionId: string) {
  const email = 'admin@seed-nti.demo';
  const code = '482910';

  const [existing] = await db
    .select({ id: otps.id })
    .from(otps)
    .where(
      and(
        eq(otps.institutionId, institutionId),
        eq(otps.email, email),
        eq(otps.code, code),
      ),
    )
    .limit(1);

  if (existing) {
    console.log('  otp: exists');
    return;
  }

  await db.insert(otps).values({
    institutionId,
    email,
    code,
    expiresAt: daysFromNow(1),
    used: false,
  });

  console.log('  otp: created');
}

async function ensureMemos(
  db: DrizzleDB,
  institutionId: string,
  userIds: IdMap,
  roleIds: IdMap,
  departmentIds: IdMap,
): Promise<IdMap> {
  const ids: IdMap = {};

  for (const memo of DEMO_MEMOS) {
    const [existing] = await db
      .select({ id: memos.id })
      .from(memos)
      .where(
        and(
          eq(memos.institutionId, institutionId),
          eq(memos.subject, memo.subject),
        ),
      )
      .limit(1);

    if (existing) {
      ids[memo.key] = existing.id;
      continue;
    }

    const senderId = userIds[memo.senderKey];
    if (!senderId) {
      throw new Error(`Sender not found for memo: ${memo.senderKey}`);
    }

    let targetPayload: Record<string, unknown> = {};
    if (memo.targetType === 'department' && 'departmentCode' in memo) {
      targetPayload = { department_ids: [departmentIds[memo.departmentCode]] };
    } else if (memo.targetType === 'role' && 'roleName' in memo) {
      targetPayload = { role_ids: [roleIds[memo.roleName]] };
    }

    const sentAt = memo.status === 'sent' ? daysAgo(2) : undefined;

    const [created] = await db
      .insert(memos)
      .values({
        institutionId,
        senderId,
        subject: memo.subject,
        body: memo.body,
        category: memo.category,
        priority: memo.priority,
        status: memo.status,
        targetType: memo.targetType,
        targetPayload,
        requiresAck: memo.requiresAck,
        ackDeadlineAt: memo.requiresAck ? daysFromNow(5) : undefined,
        sentAt,
      })
      .returning({ id: memos.id });

    ids[memo.key] = created.id;
  }

  console.log(`  memos: ${Object.keys(ids).length} ready`);
  return ids;
}

async function ensureMemoRecipients(db: DrizzleDB, memoIds: IdMap, userIds: IdMap) {
  const welcomeMemoId = memoIds['welcome'];
  const traineeIds = [userIds['trainee-1'], userIds['trainee-2']].filter(
    Boolean,
  ) as string[];

  if (!welcomeMemoId || traineeIds.length === 0) return;

  let created = 0;
  for (const userId of traineeIds) {
    const [existing] = await db
      .select({ id: memoRecipients.id })
      .from(memoRecipients)
      .where(
        and(
          eq(memoRecipients.memoId, welcomeMemoId),
          eq(memoRecipients.userId, userId),
        ),
      )
      .limit(1);

    if (existing) continue;

    await db.insert(memoRecipients).values({
      memoId: welcomeMemoId,
      userId,
      deliveredAt: daysAgo(2),
      readAt: daysAgo(1),
      acknowledgedAt: userId === traineeIds[0] ? daysAgo(1) : undefined,
      ackType: userId === traineeIds[0] ? 'simple' : undefined,
    });
    created++;
  }

  console.log(`  memo_recipient: ${created} created`);
}

async function ensureAttachments(
  db: DrizzleDB,
  memoIds: IdMap,
  userIds: IdMap,
) {
  const memoId = memoIds['ict-schedule'];
  const uploaderId = userIds['hod-ict'];
  if (!memoId || !uploaderId) return;

  const storageKey = 'seed/demo/ict-schedule.pdf';

  const [existing] = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(eq(attachments.storageKey, storageKey))
    .limit(1);

  if (existing) {
    console.log('  attachment: exists');
    return;
  }

  await db.insert(attachments).values({
    memoId,
    uploadedBy: uploaderId,
    originalFilename: 'ict-practical-schedule.pdf',
    storageKey,
    mimeType: 'application/pdf',
    sizeBytes: 245_760,
  });

  console.log('  attachment: created');
}

async function ensureNotifications(
  db: DrizzleDB,
  institutionId: string,
  memoIds: IdMap,
  userIds: IdMap,
) {
  const memoId = memoIds['welcome'];
  const userId = userIds['trainee-1'];
  if (!memoId || !userId) return;

  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.memoId, memoId),
        eq(notifications.userId, userId),
        eq(notifications.channel, 'fcm'),
      ),
    )
    .limit(1);

  if (existing) {
    console.log('  notification: exists');
    return;
  }

  await db.insert(notifications).values({
    institutionId,
    userId,
    memoId,
    channel: 'fcm',
    status: 'sent',
    sentAt: daysAgo(2),
  });

  console.log('  notification: created');
}

async function ensureMessageThreads(
  db: DrizzleDB,
  institutionId: string,
  memoIds: IdMap,
  userIds: IdMap,
) {
  const memoId = memoIds['welcome'];
  const senderId = userIds['trainee-1'];
  const recipientId = userIds['principal'];
  if (!memoId || !senderId || !recipientId) return;

  const body = `${SEED_MARKER} Thank you for the welcome memo.`;

  const [existing] = await db
    .select({ id: messageThreads.id })
    .from(messageThreads)
    .where(
      and(
        eq(messageThreads.memoId, memoId),
        eq(messageThreads.senderId, senderId),
        eq(messageThreads.body, body),
      ),
    )
    .limit(1);

  if (existing) {
    console.log('  message_thread: exists');
    return;
  }

  await db.insert(messageThreads).values({
    institutionId,
    memoId,
    senderId,
    recipientId,
    body,
    isRead: false,
  });

  console.log('  message_thread: created');
}

async function ensureAuditLogs(
  db: DrizzleDB,
  institutionId: string,
  userIds: IdMap,
) {
  const actorId = userIds['admin'];
  const action = `${SEED_MARKER} institution.provisioned`;

  const [existing] = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.institutionId, institutionId),
        eq(auditLogs.action, action),
      ),
    )
    .limit(1);

  if (existing) {
    console.log('  audit_log: exists');
    return;
  }

  await db.insert(auditLogs).values({
    institutionId,
    actorId,
    action,
    entityType: 'institution',
    entityId: institutionId,
    afterState: { status: 'active', source: 'seed' },
    ipAddress: '127.0.0.1',
    userAgent: 'MemoSeed/1.0',
  });

  console.log('  audit_log: created');
}

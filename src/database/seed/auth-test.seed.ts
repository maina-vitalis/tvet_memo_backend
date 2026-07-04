import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { DrizzleDB } from '../drizzle';
import { institutions, users } from '../schema';
import { AUTH_TEST_INSTITUTION, AUTH_TEST_TRAINEE } from './fixtures';

/**
 * [AUTH] Seeds the registry/email auth-test trainee used by mobile dev scripts.
 * Uses the unified users table with fixed role enum (no roles table).
 */
export async function seedAuthTestData(db: DrizzleDB) {
  const passwordHash = await argon2.hash(AUTH_TEST_TRAINEE.password, {
    type: argon2.argon2id,
  });

  const normalizedEmail = AUTH_TEST_TRAINEE.email.toLowerCase();

  let institutionId: string;

  const [existingInstitution] = await db
    .select({ id: institutions.id })
    .from(institutions)
    .where(eq(institutions.schoolCode, AUTH_TEST_INSTITUTION.schoolCode))
    .limit(1);

  if (existingInstitution) {
    institutionId = existingInstitution.id;

    await db
      .update(institutions)
      .set({
        name: AUTH_TEST_INSTITUTION.name,
        subdomain: AUTH_TEST_INSTITUTION.subdomain,
        contactEmail: AUTH_TEST_INSTITUTION.contactEmail,
      })
      .where(eq(institutions.id, institutionId));

    console.log(`  institution: updated (${AUTH_TEST_INSTITUTION.schoolCode})`);
  } else {
    const [created] = await db
      .insert(institutions)
      .values({
        name: AUTH_TEST_INSTITUTION.name,
        subdomain: AUTH_TEST_INSTITUTION.subdomain,
        schoolCode: AUTH_TEST_INSTITUTION.schoolCode,
        contactEmail: AUTH_TEST_INSTITUTION.contactEmail,
        status: 'active',
      })
      .returning({ id: institutions.id });

    institutionId = created.id;
    console.log(`  institution: created (${AUTH_TEST_INSTITUTION.schoolCode})`);
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUser) {
    await db
      .update(users)
      .set({
        institutionId,
        role: AUTH_TEST_TRAINEE.role,
        firstName: AUTH_TEST_TRAINEE.firstName,
        lastName: AUTH_TEST_TRAINEE.lastName,
        admissionNumber: AUTH_TEST_TRAINEE.admissionNumber,
        passwordHash,
        mustChangePassword: true,
        isActive: true,
      })
      .where(eq(users.id, existingUser.id));

    console.log(`  trainee: updated (${normalizedEmail})`);
    return;
  }

  await db.insert(users).values({
    institutionId,
    role: AUTH_TEST_TRAINEE.role,
    firstName: AUTH_TEST_TRAINEE.firstName,
    lastName: AUTH_TEST_TRAINEE.lastName,
    email: normalizedEmail,
    admissionNumber: AUTH_TEST_TRAINEE.admissionNumber,
    passwordHash,
    mustChangePassword: true,
  });

  console.log(`  trainee: created (${normalizedEmail})`);
}
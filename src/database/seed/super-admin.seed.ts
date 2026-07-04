import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { Role } from '../../common/rbac/role.enum';
import { DrizzleDB } from '../drizzle';
import { users } from '../schema';

/** [AUTH] Seeds the platform SUPER_ADMIN in the unified users table. */
export async function seedSuperAdmin(db: DrizzleDB) {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME ?? 'Platform';
  const lastName = process.env.SUPER_ADMIN_LAST_NAME ?? 'Admin';

  if (!email || !password) {
    throw new Error(
      'SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required for seeding',
    );
  }

  const normalizedEmail = email.toLowerCase();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  if (existing) {
    await db
      .update(users)
      .set({
        firstName,
        lastName,
        passwordHash,
        role: Role.SUPER_ADMIN,
        institutionId: null,
        mustChangePassword: false,
        isActive: true,
      })
      .where(eq(users.id, existing.id));

    console.log(`  super_admin: updated (${normalizedEmail})`);
    return;
  }

  await db.insert(users).values({
    email: normalizedEmail,
    firstName,
    lastName,
    passwordHash,
    role: Role.SUPER_ADMIN,
    institutionId: null,
    mustChangePassword: false,
  });

  console.log(`  super_admin: created (${normalizedEmail})`);
}
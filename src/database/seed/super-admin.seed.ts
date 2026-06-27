import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { DrizzleDB } from '../drizzle';
import { superAdmins } from '../schema';

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
    .select({ id: superAdmins.id })
    .from(superAdmins)
    .where(eq(superAdmins.email, normalizedEmail))
    .limit(1);

  if (existing) {
    console.log(`  super_admin: exists (${normalizedEmail})`);
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await db.insert(superAdmins).values({
    email: normalizedEmail,
    firstName,
    lastName,
    passwordHash,
  });

  console.log(`  super_admin: created (${normalizedEmail})`);
}

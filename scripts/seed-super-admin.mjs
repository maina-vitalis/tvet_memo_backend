import 'dotenv/config';
import argon2 from 'argon2';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function seedSuperAdmin() {
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

  const [existing] = await sql`
    SELECT id FROM super_admin WHERE email = ${normalizedEmail} LIMIT 1
  `;

  if (existing) {
    console.log(`Super admin already exists for ${normalizedEmail}`);
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await sql`
    INSERT INTO super_admin (email, first_name, last_name, password_hash)
    VALUES (${normalizedEmail}, ${firstName}, ${lastName}, ${passwordHash})
  `;

  console.log(`Created super admin ${normalizedEmail}`);
}

seedSuperAdmin()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });

import 'dotenv/config';
import argon2 from 'argon2';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const users = await sql`
    SELECT
      u.admission_number,
      u.email,
      u.must_change_password,
      i.name AS institution_name,
      i.school_code
    FROM "user" u
    JOIN institution i ON i.id = u.institution_id
    WHERE u.admission_number IS NOT NULL
    ORDER BY u.created_at DESC
    LIMIT 10
  `;

  console.log('Users with admission numbers:');
  console.log(JSON.stringify(users, null, 2));

  const trainee = users.find((u) => u.admission_number === 'NTI/2023/1234');
  if (trainee) {
    const [row] = await sql`
      SELECT password_hash FROM "user"
      WHERE admission_number = 'NTI/2023/1234'
      LIMIT 1
    `;
    const matches = await argon2.verify(row.password_hash, 'NTI/2023/1234');
    console.log('\nPassword "NTI/2023/1234" matches hash:', matches);
  } else {
    console.log('\nNo user with admission NTI/2023/1234 — run: pnpm db:seed-auth');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  console.log('Dropping public and drizzle schemas...');
  await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await sql.unsafe('CREATE SCHEMA public');
  await sql.unsafe('GRANT ALL ON SCHEMA public TO public');
  console.log('Database reset complete.');
} catch (error) {
  console.error('Database reset failed:', error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

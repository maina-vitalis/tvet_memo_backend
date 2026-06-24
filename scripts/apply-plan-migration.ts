import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql.unsafe(`
      DO $$ BEGIN
        CREATE TYPE institution_plan AS ENUM('trial', 'basic', 'pro');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await sql.unsafe(`
      ALTER TABLE institution
      ADD COLUMN IF NOT EXISTS plan institution_plan DEFAULT 'trial' NOT NULL;
    `);

    console.log('Migration applied successfully');
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import 'dotenv/config';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { createPostgresOptions } from './postgres-options';

const migrationsFolder = path.join(process.cwd(), 'migrations');

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = postgres(
    databaseUrl,
    createPostgresOptions({ max: 1, onnotice: () => undefined }),
  );
  const db = drizzle(sql);

  console.log(`Applying migrations from ${migrationsFolder}`);

  try {
    await migrate(db, { migrationsFolder });
    console.log('Migrations applied successfully.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

runMigrations().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Migration failed:', message);
  console.error(
    'Tip: for local dev drift, run `pnpm db:push` to sync schema, then `pnpm db:generate` to capture SQL.',
  );
  process.exit(1);
});

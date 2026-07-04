import 'dotenv/config';
import { createDrizzleClient } from '../drizzle';
import { seedSuperAdmin } from './super-admin.seed';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const db = createDrizzleClient(process.env.DATABASE_URL);
  await seedSuperAdmin(db);
}

main().catch((error: unknown) => {
  console.error('Super admin seed failed:', error);
  process.exit(1);
});
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Set it in .env before running drizzle-kit.');
}

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
  migrations: {
    prefix: 'timestamp',
    table: '__drizzle_migrations',
    schema: 'drizzle',
  },
});

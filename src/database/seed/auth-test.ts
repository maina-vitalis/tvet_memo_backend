import 'dotenv/config';
import { createDrizzleClient } from '../drizzle';
import { seedAuthTestData } from './auth-test.seed';
import { AUTH_TEST_INSTITUTION, AUTH_TEST_TRAINEE } from './fixtures';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const db = createDrizzleClient(process.env.DATABASE_URL);

  console.log('Running auth-test seed...\n');
  await seedAuthTestData(db);

  console.log('\n--- Auth-test seed complete ---');
  console.log('Institution:', AUTH_TEST_INSTITUTION.name);
  console.log('Email domain (subdomain):', AUTH_TEST_INSTITUTION.subdomain);
  console.log('Shortcode:', AUTH_TEST_INSTITUTION.schoolCode);
  console.log('Student email:', AUTH_TEST_TRAINEE.email);
  console.log('Admission number:', AUTH_TEST_TRAINEE.admissionNumber);
  console.log('Default password (registry login):', AUTH_TEST_TRAINEE.admissionNumber);
  console.log('\nEndpoints:');
  console.log('  POST /auth/login/registry');
  console.log('  POST /auth/login/email/initiate');
}

main().catch((error: unknown) => {
  console.error('Auth-test seed failed:', error);
  process.exit(1);
});
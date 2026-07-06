import 'dotenv/config';
import { createDrizzleClient } from '../drizzle';
import { seedDemoData } from './demo-data';
import {
  DEMO_DEFAULT_PASSWORD,
  DEMO_INSTITUTION,
  DEMO_PASSWORD_ENV,
  DEMO_SETUP_TOKEN,
  DEMO_USERS,
} from './fixtures';
import { seedSuperAdmin } from './super-admin.seed';

function printSummary() {
  const password =
    process.env[DEMO_PASSWORD_ENV]?.trim() || DEMO_DEFAULT_PASSWORD;
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL ?? '(not set)';

  console.log('\n--- Seed summary ---');
  console.log('Tables populated:');
  console.log(
    '  users (unified + role enum), institution, department, account_setup_token,',
  );
  console.log(
    '  session, otp, memo, memo_recipient, attachment, notification,',
  );
  console.log('  message_thread, audit_log');
  console.log('\nSuper admin (POST /auth/login):');
  console.log(`  Email:    ${superAdminEmail}`);
  console.log('  Password: SUPER_ADMIN_PASSWORD from .env');
  console.log('  Role:     SUPER_ADMIN (institutionId = null)');
  console.log('\nDemo institution:');
  console.log(`  Name:        ${DEMO_INSTITUTION.name}`);
  console.log(`  Subdomain:   ${DEMO_INSTITUTION.subdomain}`);
  console.log(`  School code: ${DEMO_INSTITUTION.schoolCode}`);
  console.log('\nDemo users (password unless noted):');
  for (const user of DEMO_USERS) {
    const note = user.pendingSetup
      ? ' (pending setup — locked password)'
      : ` [${user.role}] → ${password}`;
    console.log(`  ${user.email}${note}`);
  }
  console.log('\nDemo tokens:');
  console.log(`  Setup token (pending@seed-nti.demo): ${DEMO_SETUP_TOKEN}`);
  console.log(`  OTP for admin@seed-nti.demo: 482910`);
  console.log('\nAuth endpoints (institution users):');
  console.log('  POST /auth/login');
  console.log('  POST /auth/login/email/initiate');
  console.log('  POST /auth/login/registry');
  console.log('\nRe-run safe: existing demo users are updated in place.');
}

async function seed() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const db = createDrizzleClient(process.env.DATABASE_URL);

  console.log('Running database seeds...\n');

  console.log('[super_admin]');
  await seedSuperAdmin(db);

  console.log('\n[demo data]');
  await seedDemoData(db);

  printSummary();
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});

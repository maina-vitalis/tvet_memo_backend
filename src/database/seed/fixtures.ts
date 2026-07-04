/** Marker prefix — used to find and skip re-creating demo rows on re-run. */
export const SEED_MARKER = '[SEED]';

export const DEMO_PASSWORD_ENV = 'SEED_DEFAULT_PASSWORD';
export const DEMO_DEFAULT_PASSWORD = 'Test@12345';

export const DEMO_SESSION_TOKEN = 'seed-demo-session-token-principal';
export const DEMO_SETUP_TOKEN = 'seed-demo-setup-token-pending';

export const DEMO_INSTITUTION = {
  name: 'Nairobi Technical Institute (Demo)',
  subdomain: 'seed-nti.demo',
  schoolCode: 'SEED-NTI-001',
  contactEmail: 'contact@seed-nti.demo',
  plan: 'pro' as const,
  status: 'active' as const,
  seatQuota: 500,
};

export const DEMO_DEPARTMENTS = [
  { name: 'Information Communication Technology', code: 'ICT' },
  { name: 'Automotive Engineering', code: 'AUTO' },
  { name: 'Business Studies', code: 'BUS' },
] as const;

import { Role } from '../../common/rbac/role.enum';

export type DemoUserFixture = {
  key: string;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  departmentCode?: string;
  staffNumber?: string;
  admissionNumber?: string;
  mustChangePassword?: boolean;
  pendingSetup?: boolean;
};

export const DEMO_USERS: DemoUserFixture[] = [
  {
    key: 'admin',
    role: Role.INSTITUTION_ADMIN,
    firstName: 'Grace',
    lastName: 'Wanjiku',
    email: 'admin@seed-nti.demo',
    staffNumber: 'STF-001',
    mustChangePassword: false,
  },
  {
    key: 'principal',
    role: Role.PRINCIPAL,
    firstName: 'James',
    lastName: 'Ochieng',
    email: 'principal@seed-nti.demo',
    staffNumber: 'STF-002',
    mustChangePassword: false,
  },
  {
    key: 'hod-ict',
    role: Role.HOD,
    firstName: 'Mary',
    lastName: 'Akinyi',
    email: 'hod.ict@seed-nti.demo',
    departmentCode: 'ICT',
    staffNumber: 'STF-003',
    mustChangePassword: false,
  },
  {
    key: 'trainer-ict',
    role: Role.TRAINER,
    firstName: 'Peter',
    lastName: 'Mutua',
    email: 'trainer@seed-nti.demo',
    departmentCode: 'ICT',
    staffNumber: 'STF-004',
    mustChangePassword: false,
  },
  {
    key: 'trainee-1',
    role: Role.TRAINEE,
    firstName: 'Faith',
    lastName: 'Chebet',
    email: 'trainee1@seed-nti.demo',
    departmentCode: 'ICT',
    admissionNumber: 'NTI/2024/0001',
    mustChangePassword: false,
  },
  {
    key: 'trainee-2',
    role: Role.TRAINEE,
    firstName: 'Brian',
    lastName: 'Kiprop',
    email: 'trainee2@seed-nti.demo',
    departmentCode: 'ICT',
    admissionNumber: 'NTI/2024/0002',
    mustChangePassword: false,
  },
  {
    key: 'pending-setup',
    role: Role.TRAINER,
    firstName: 'New',
    lastName: 'Hire',
    email: 'pending@seed-nti.demo',
    departmentCode: 'AUTO',
    staffNumber: 'STF-005',
    mustChangePassword: true,
    pendingSetup: true,
  },
];

export const DEMO_MEMOS = [
  {
    key: 'welcome',
    subject: `${SEED_MARKER} Welcome to the new term`,
    body: 'All staff and trainees are reminded to report on Monday at 8:00 AM.',
    category: 'general' as const,
    priority: 'normal' as const,
    status: 'sent' as const,
    targetType: 'broadcast' as const,
    senderKey: 'principal',
    requiresAck: true,
  },
  {
    key: 'ict-schedule',
    subject: `${SEED_MARKER} ICT practical schedule`,
    body: 'ICT trainees should report to Lab 2 for practical sessions this week.',
    category: 'academic' as const,
    priority: 'high' as const,
    status: 'sent' as const,
    targetType: 'department' as const,
    senderKey: 'hod-ict',
    requiresAck: false,
    departmentCode: 'ICT',
  },
  {
    key: 'staff-draft',
    subject: `${SEED_MARKER} Staff meeting agenda (draft)`,
    body: 'Draft agenda for the monthly staff meeting — pending review.',
    category: 'administrative' as const,
    priority: 'low' as const,
    status: 'draft' as const,
    targetType: 'role' as const,
    senderKey: 'admin',
    requiresAck: false,
    role: Role.TRAINER,
  },
] as const;

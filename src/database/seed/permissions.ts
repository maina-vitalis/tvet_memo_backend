import { NewPermission } from '../schema/permissions';

/**
 * CANONICAL LIST OF PERMISSIONS
 *
 * This is the master list. All RBAC in the system should be built from these keys.
 *
 * Categories are used for grouping in UI and filtering.
 * Keys follow strict <scope>.<area>.<action> convention.
 */

export const PLATFORM_PERMISSIONS: NewPermission[] = [
  {
    key: 'platform.institutions.create',
    name: 'Create Institutions',
    description: 'Provision new tenant institutions',
    category: 'platform',
  },
  {
    key: 'platform.institutions.manage',
    name: 'Manage Institutions',
    description: 'Update, suspend, view details of any institution',
    category: 'platform',
  },
  {
    key: 'platform.institutions.suspend',
    name: 'Suspend Institutions',
    description: 'Suspend or reactivate institutions',
    category: 'platform',
  },
  {
    key: 'platform.super_admins.manage',
    name: 'Manage Super Admins',
    description: 'Create, update, or remove platform super administrators',
    category: 'platform',
  },
  {
    key: 'platform.audit.view',
    name: 'View Global Audit',
    description: 'Access cross-tenant audit logs',
    category: 'platform',
  },
];

export const TENANT_PERMISSIONS: NewPermission[] = [
  // Memos
  { key: 'tenant.memos.send', name: 'Send Memos', description: 'Base permission to create and send memos', category: 'memos' },
  { key: 'tenant.memos.send.broadcast', name: 'Broadcast Memos', description: 'Send to entire institution', category: 'memos' },
  { key: 'tenant.memos.send.target_department', name: 'Send to Departments', description: 'Target specific departments', category: 'memos' },
  { key: 'tenant.memos.send.target_role', name: 'Send to Roles', description: 'Target specific roles', category: 'memos' },
  { key: 'tenant.memos.send.target_individual', name: 'Send to Individuals', description: 'Send to specific users', category: 'memos' },
  { key: 'tenant.memos.view.all', name: 'View All Memos', description: 'View every memo in the institution', category: 'memos' },
  { key: 'tenant.memos.view.department', name: 'View Department Memos', description: 'View memos within own department', category: 'memos' },
  { key: 'tenant.memos.view.own', name: 'View Own Memos', description: 'View memos sent to or by self', category: 'memos' },

  // Users & Directory
  { key: 'tenant.users.create', name: 'Create Users', description: 'Provision new users', category: 'users' },
  { key: 'tenant.users.manage', name: 'Manage Users', description: 'Update, deactivate users', category: 'users' },
  { key: 'tenant.users.view', name: 'View Users', description: 'View user directory', category: 'users' },
  { key: 'tenant.users.assign_roles', name: 'Assign Roles', description: 'Change user roles', category: 'users' },

  // Roles & Permissions
  { key: 'tenant.roles.manage', name: 'Manage Roles', description: 'Create, update, delete roles and their permissions', category: 'roles' },
  { key: 'tenant.roles.assign', name: 'Assign Roles to Users', description: 'Change which role a user has', category: 'roles' },

  // Departments
  { key: 'tenant.departments.manage', name: 'Manage Departments', description: 'Create, update, delete departments', category: 'departments' },

  // Institution settings (tenant admin level)
  { key: 'tenant.institution.settings', name: 'Manage Institution Settings', description: 'Update institution profile, branding, etc.', category: 'institution' },
  { key: 'tenant.institution.reports', name: 'View Institution Reports', description: 'Access analytics and reports', category: 'institution' },
];

export const ALL_PERMISSIONS = [...PLATFORM_PERMISSIONS, ...TENANT_PERMISSIONS];

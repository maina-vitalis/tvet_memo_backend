import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import {
  accountSetupTokens,
  institutions,
  roles,
  users,
  sessions,
  memoRecipients,
  attachments,
  messageThreads,
  notifications,
  otps,
  auditLogs,
  memos,
  departments,
  permissions,
  rolePermissions,
} from '../../database/schema';
import { DEFAULT_ROLES } from '../../database/seed/default-roles';
import {
  generateSetupToken,
  getLockedPasswordHash,
  hashToken,
  sanitizeUser,
} from '../../common/utils/crypto.util';
import { MailService } from '../mail/mail.service';
import {
  ProvisionInitialStatus,
  ProvisionInstitutionDto,
} from './dto/provision-institution.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';

const RESERVED_SUBDOMAIN_SLUGS = new Set([
  'www',
  'admin',
  'api',
  'app',
  'mail',
  'info',
]);

@Injectable()
export class SuperAdminInstitutionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  //provisioning the instittuion and the admin
  async provision(dto: ProvisionInstitutionDto) {
    const adminEmail = dto.adminEmail;
    const schoolCode = dto.shortcode;
    const subdomain = dto.subdomainSlug;

    //reserved domains
    if (isReservedInstitutionDomain(subdomain)) {
      throw new BadRequestException(
        'This subdomain is reserved. Choose a different domain.',
      );
    }

    //check if the domain and code are unique
    await this.assertUniqueInstitutionIdentifiers(subdomain, schoolCode);

    const passwordHash = await getLockedPasswordHash();
    const setupToken = generateSetupToken();
    const tokenHash = hashToken(setupToken);
    const expiryHours = this.configService.get<number>(
      'setupToken.expiryHours',
      72,
    );
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const subscriptionEndsAt = new Date(
      Date.now() + dto.subscriptionDays * 24 * 60 * 60 * 1000,
    );

    const { firstName, lastName } = splitAdminFullName(dto.adminFullName);
    const isActive = dto.initialStatus !== 'pending';

    const result = await this.db.transaction(async (tx) => {
      const [institution] = await tx
        .insert(institutions)
        .values({
          name: dto.institutionName,
          subdomain,
          schoolCode,
          contactEmail: adminEmail,
          seatQuota: dto.seatQuota,
          status: dto.initialStatus,
          plan: mapInitialStatusToPlan(dto.initialStatus),
          isActive,
          subscriptionEndsAt,
          provisioningNotes: dto.provisioningNotes ?? null,
        })
        .returning();

      // ====================================================================
      // RBAC: Insert roles + assign permissions from the global registry
      // ====================================================================
      const insertedRoles = await tx
        .insert(roles)
        .values(
          DEFAULT_ROLES.map((role) => ({
            ...role,
            institutionId: institution.id,
          })),
        )
        .returning();

      // Load all permissions (they are global)
      const allPerms = await tx.select().from(permissions);

      const permMap = new Map(allPerms.map((p) => [p.key, p.id]));

      // Define sensible default permission grants per role name
      // This is the foundation for proper RBAC instead of unstructured JSONB
      const rolePermissionAssignments: Record<string, string[]> = {
        'Board of Governors': [
          'tenant.memos.send',
          'tenant.memos.send.broadcast',
          'tenant.memos.send.target_department',
          'tenant.memos.send.target_role',
          'tenant.memos.send.target_individual',
          'tenant.memos.view.all',
          'tenant.users.view',
          'tenant.institution.settings',
          'tenant.institution.reports',
        ],
        'Institutional Admin': [
          'tenant.memos.send',
          'tenant.memos.send.broadcast',
          'tenant.memos.send.target_department',
          'tenant.memos.send.target_role',
          'tenant.memos.send.target_individual',
          'tenant.memos.view.all',
          'tenant.users.create',
          'tenant.users.manage',
          'tenant.users.view',
          'tenant.users.assign_roles',
          'tenant.roles.manage',
          'tenant.roles.assign',
          'tenant.departments.manage',
          'tenant.institution.settings',
          'tenant.institution.reports',
        ],
        Principal: [
          'tenant.memos.send',
          'tenant.memos.send.broadcast',
          'tenant.memos.send.target_department',
          'tenant.memos.send.target_role',
          'tenant.memos.send.target_individual',
          'tenant.memos.view.all',
          'tenant.users.manage',
          'tenant.users.view',
          'tenant.users.assign_roles',
          'tenant.institution.reports',
        ],
        'Deputy Principal': [
          'tenant.memos.send',
          'tenant.memos.send.broadcast',
          'tenant.memos.send.target_department',
          'tenant.memos.send.target_role',
          'tenant.memos.send.target_individual',
          'tenant.memos.view.all',
          'tenant.users.view',
        ],
        'Head of Department': [
          'tenant.memos.send',
          'tenant.memos.send.target_role',
          'tenant.memos.send.target_individual',
          'tenant.memos.view.department',
          'tenant.users.view',
        ],
        Trainer: [
          'tenant.memos.send',
          'tenant.memos.send.target_individual',
          'tenant.memos.view.department',
        ],
        'Support Staff': [
          'tenant.memos.view.own',
        ],
        Trainee: [
          'tenant.memos.view.own',
        ],
      };

      // Insert role_permissions for each role
      for (const role of insertedRoles) {
        const keys = rolePermissionAssignments[role.name] || [];
        const permIds = keys
          .map((k) => permMap.get(k))
          .filter((id): id is string => !!id);

        if (permIds.length > 0) {
          await tx.insert(rolePermissions).values(
            permIds.map((pid) => ({
              roleId: role.id,
              permissionId: pid,
            })),
          );
        }
      }

      //checking if institution admin exists in the database before onboarding
      const institutionalAdminRole = insertedRoles.find(
        (role) => role.name === 'Institutional Admin',
      );

      if (!institutionalAdminRole) {
        throw new NotFoundException(
          'Institutional Admin role not found after seeding',
        );
      }

      const [rootUser] = await tx
        .insert(users)
        .values({
          institutionId: institution.id,
          roleId: institutionalAdminRole.id,
          firstName,
          lastName,
          email: adminEmail,
          passwordHash,
          mustChangePassword: true,
        })
        .returning();

      // replace with redis for better performance and scalability in the future
      await tx.insert(accountSetupTokens).values({
        institutionId: institution.id,
        userId: rootUser.id,
        tokenHash,
        expiresAt,
      });

      return { institution, rootUser };
    });

    const portalBaseDomain =
      this.configService.getOrThrow<string>('portal.baseDomain');
    const setupUrl = `https://${portalBaseDomain}/setup?token=${setupToken}`;

    await this.mailService.sendInstitutionWelcomeEmail({
      to: adminEmail,
      institutionName: dto.institutionName,
      setupUrl,
    });

    return {
      id: result.institution.id,
      name: result.institution.name,
      subdomain: result.institution.subdomain,
      shortcode: result.institution.schoolCode,
      status: result.institution.status,
      seatQuota: result.institution.seatQuota,
      rootUser: sanitizeUser(result.rootUser),
      message:
        'Institution provisioned. A setup link has been sent to the admin email.',
    };
  }

  //get all institutions in the system for super admin
  async findAll() {
    return this.db
      .select()
      .from(institutions)
      .orderBy(desc(institutions.createdAt));
  }

  //update institution details for super admin
  async update(id: string, dto: UpdateInstitutionDto) {
    const [existing] = await this.db
      .select()
      .from(institutions)
      .where(eq(institutions.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Institution not found');
    }

    const [updated] = await this.db
      .update(institutions)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(institutions.id, id))
      .returning();

    return updated;
  }

  //remove institution and all its related data for super admin
  async remove(id: string) {
    const [existing] = await this.db
      .select()
      .from(institutions)
      .where(eq(institutions.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Institution not found');
    }

    await this.db.transaction(async (tx) => {
      // Find all users belonging to this institution
      const institutionUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.institutionId, id));
      const userIds = institutionUsers.map((u) => u.id);

      if (userIds.length > 0) {
        // Delete sessions for these users
        await tx.delete(sessions).where(inArray(sessions.userId, userIds));
        // Delete memo_recipients for these users
        await tx
          .delete(memoRecipients)
          .where(inArray(memoRecipients.userId, userIds));
        // Delete attachments uploaded by these users
        await tx
          .delete(attachments)
          .where(inArray(attachments.uploadedBy, userIds));
      }

      // Delete message threads for this institution
      await tx
        .delete(messageThreads)
        .where(eq(messageThreads.institutionId, id));

      // Delete notifications for this institution
      await tx.delete(notifications).where(eq(notifications.institutionId, id));

      // Delete otps for this institution
      await tx.delete(otps).where(eq(otps.institutionId, id));

      // Delete setup tokens
      await tx
        .delete(accountSetupTokens)
        .where(eq(accountSetupTokens.institutionId, id));

      // Delete audit logs
      await tx.delete(auditLogs).where(eq(auditLogs.institutionId, id));

      // Delete memos
      await tx.delete(memos).where(eq(memos.institutionId, id));

      // Delete users
      await tx.delete(users).where(eq(users.institutionId, id));

      // Delete departments
      await tx.delete(departments).where(eq(departments.institutionId, id));

      // Delete roles
      await tx.delete(roles).where(eq(roles.institutionId, id));

      // Finally, delete the institution
      await tx.delete(institutions).where(eq(institutions.id, id));
    });

    return { success: true, message: 'Institution deleted successfully' };
  }

  //checking if the school domain and code are unique
  private async assertUniqueInstitutionIdentifiers(
    subdomain: string,
    schoolCode: string,
  ) {
    const [existingSubdomain] = await this.db
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.subdomain, subdomain))
      .limit(1);

    if (existingSubdomain) {
      throw new ConflictException('Subdomain already exists');
    }

    const [existingSchoolCode] = await this.db
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.schoolCode, schoolCode))
      .limit(1);

    if (existingSchoolCode) {
      throw new ConflictException('Shortcode already exists');
    }
  }
}

function splitAdminFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Administrator' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function mapInitialStatusToPlan(
  initialStatus: ProvisionInitialStatus,
): 'trial' | 'basic' | 'pro' {
  if (initialStatus === 'active') {
    return 'basic';
  }

  return 'trial';
}

function isReservedInstitutionDomain(subdomain: string): boolean {
  const label = subdomain.trim().toLowerCase().split('.')[0];
  return RESERVED_SUBDOMAIN_SLUGS.has(label);
}

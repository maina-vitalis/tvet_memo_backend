import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import {
  accountSetupTokens,
  institutions,
  roles,
  users,
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

const RESERVED_SUBDOMAIN_SLUGS = new Set([
  'www',
  'admin',
  'api',
  'app',
  'mail',
]);

@Injectable()
export class SuperAdminInstitutionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async provision(dto: ProvisionInstitutionDto) {
    const adminEmail = dto.adminEmail;
    const schoolCode = dto.shortcode;
    const subdomain = dto.subdomainSlug;

    if (isReservedInstitutionDomain(subdomain)) {
      throw new BadRequestException(
        'This subdomain is reserved. Choose a different domain.',
      );
    }

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

      const insertedRoles = await tx
        .insert(roles)
        .values(
          DEFAULT_ROLES.map((role) => ({
            ...role,
            institutionId: institution.id,
          })),
        )
        .returning();

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

  async findAll() {
    return this.db
      .select()
      .from(institutions)
      .orderBy(desc(institutions.createdAt));
  }

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
  return RESERVED_SUBDOMAIN_SLUGS.has(subdomain);
}

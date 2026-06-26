import {
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
import { ProvisionInstitutionDto } from './dto/provision-institution.dto';

@Injectable()
export class SuperAdminInstitutionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async provision(dto: ProvisionInstitutionDto) {
    const rootEmail = dto.rootEmail.toLowerCase();
    const schoolCode = dto.shortcode.toUpperCase();
    console.log(rootEmail, schoolCode);

    await this.assertUniqueInstitutionIdentifiers(dto.subdomain, schoolCode);

    const passwordHash = await getLockedPasswordHash();
    const setupToken = generateSetupToken();
    const tokenHash = hashToken(setupToken);
    const expiryHours = this.configService.get<number>(
      'setupToken.expiryHours',
      72,
    );
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const result = await this.db.transaction(async (tx) => {
      const [institution] = await tx
        .insert(institutions)
        .values({
          name: dto.name,
          subdomain: dto.subdomain,
          schoolCode,
          contactEmail: rootEmail,
          seatQuota: dto.seatQuota,
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
          firstName: 'Institutional',
          lastName: 'Administrator',
          email: rootEmail,
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
      to: rootEmail,
      institutionName: dto.name,
      setupUrl,
    });

    return {
      institution: result.institution,
      rootUser: sanitizeUser(result.rootUser),
      message:
        'Institution provisioned. A setup link has been sent to the root email.',
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

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { institutions, roles, users } from '../../database/schema';
import { DEFAULT_ROLES } from '../../database/seed/default-roles';
import {
  generateTemporaryPassword,
  sanitizeUser,
} from '../../common/utils/crypto.util';
import { ProvisionInstitutionDto } from './dto/provision-institution.dto';
import { UpdateInstitutionDto } from './dto/institution.dto';

@Injectable()
export class InstitutionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async provision(dto: ProvisionInstitutionDto) {
    const principalEmail = dto.principalEmail.toLowerCase();
    const passwordGenerated = !dto.principalPassword;
    const principalPassword =
      dto.principalPassword ?? generateTemporaryPassword();

    const [existing] = await this.db
      .select({
        id: institutions.id,
        subdomain: institutions.subdomain,
        schoolCode: institutions.schoolCode,
      })
      .from(institutions)
      .where(eq(institutions.subdomain, dto.subdomain))
      .limit(1);

    if (existing) {
      throw new ConflictException('Subdomain already exists');
    }

    const [existingSchoolCode] = await this.db
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.schoolCode, dto.schoolCode))
      .limit(1);

    if (existingSchoolCode) {
      throw new ConflictException('School code already exists');
    }

    const passwordHash = await argon2.hash(principalPassword, {
      type: argon2.argon2id,
    });

    return this.db.transaction(async (tx) => {
      const [institution] = await tx
        .insert(institutions)
        .values({
          name: dto.name,
          subdomain: dto.subdomain,
          schoolCode: dto.schoolCode,
          contactEmail: dto.contactEmail,
          plan: dto.plan,
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

      const principalRole = insertedRoles.find(
        (role) => role.name === 'Principal',
      );

      if (!principalRole) {
        throw new NotFoundException('Principal role not found after seeding');
      }

      const [principal] = await tx
        .insert(users)
        .values({
          institutionId: institution.id,
          roleId: principalRole.id,
          firstName: dto.principalFirstName,
          lastName: dto.principalLastName,
          email: principalEmail,
          passwordHash,
          mustChangePassword: true,
        })
        .returning();

      return {
        institution,
        principal: sanitizeUser(principal),
        ...(passwordGenerated ? { temporaryPassword: principalPassword } : {}),
      };
    });
  }

  async findAllForPlatform() {
    return this.db
      .select()
      .from(institutions)
      .orderBy(desc(institutions.createdAt));
  }

  async findBySubdomain(subdomain: string) {
    const [institution] = await this.db
      .select()
      .from(institutions)
      .where(eq(institutions.subdomain, subdomain))
      .limit(1);

    if (!institution || !institution.isActive) {
      throw new NotFoundException('Institution not found');
    }

    return institution;
  }

  async findById(id: string) {
    const [institution] = await this.db
      .select()
      .from(institutions)
      .where(eq(institutions.id, id))
      .limit(1);

    if (!institution || !institution.isActive) {
      throw new NotFoundException('Institution not found');
    }

    return institution;
  }

  async update(id: string, dto: UpdateInstitutionDto) {
    await this.findById(id);

    const [updated] = await this.db
      .update(institutions)
      .set({
        name: dto.name,
        contactEmail: dto.contactEmail,
        logoUrl: dto.logoUrl,
        timezone: dto.timezone,
      })
      .where(eq(institutions.id, id))
      .returning();

    return updated;
  }

  async deactivate(id: string) {
    await this.findById(id);

    const [updated] = await this.db
      .update(institutions)
      .set({ isActive: false })
      .where(eq(institutions.id, id))
      .returning();

    return updated;
  }
}

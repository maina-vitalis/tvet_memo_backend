import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { extractEmailDomain } from '../../common/utils/email.util';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { accountSetupTokens, institutions, roles, users } from '../../database/schema';
import { DEFAULT_ROLES } from '../../database/seed/default-roles';
import {
  generateTemporaryPassword,
  sanitizeUser,
} from '../../common/utils/crypto.util';
import {
  DiscoverInstitutionDto,
  DiscoveredInstitutionResponse,
} from './dto/discover-institution.dto';
import { ProvisionInstitutionDto } from './dto/provision-institution.dto';
import { UpdateInstitutionDto } from './dto/institution.dto';

@Injectable()
export class InstitutionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

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

  async discover(
    dto: DiscoverInstitutionDto,
  ): Promise<DiscoveredInstitutionResponse> {
    const query = dto.query.trim();

    if (dto.mode === 'email') {

      const email = query.toLowerCase();

      const [record] = await this.db
        .select({
          id: institutions.id,
          name: institutions.name,
          schoolCode: institutions.schoolCode,
          subdomain: institutions.subdomain,
        })
        .from(users)
        .innerJoin(institutions, eq(users.institutionId, institutions.id))
        .where(
          and(
            eq(users.email, email),
            eq(users.isActive, true),
            eq(institutions.isActive, true),
          ),
        )
        .limit(1);

      if (!record) {
        throw new NotFoundException('Institution not found for this email');
      }

      return {
        id: record.id,
        name: record.name,
        shortcode: record.schoolCode,
        subdomain: record.subdomain,
      };
    }

    const [institution] = await this.db
      .select({
        id: institutions.id,
        name: institutions.name,
        schoolCode: institutions.schoolCode,
        subdomain: institutions.subdomain,
      })
      .from(institutions)
      .where(
        and(
          sql`lower(${institutions.schoolCode}) = lower(${query})`,
          eq(institutions.isActive, true),
        ),
      )
      .limit(1);

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    return {
      id: institution.id,
      name: institution.name,
      shortcode: institution.schoolCode,
      subdomain: institution.subdomain,
    };
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

  async hasPendingSetup(userId: string): Promise<boolean> {
    const [pending] = await this.db
      .select({ id: accountSetupTokens.id })
      .from(accountSetupTokens)
      .where(
        and(
          eq(accountSetupTokens.userId, userId),
          isNull(accountSetupTokens.usedAt),
        ),
      )
      .limit(1);

    return Boolean(pending);
  }
}

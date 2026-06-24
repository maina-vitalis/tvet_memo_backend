import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { institutions, roles } from '../../database/schema';
import { DEFAULT_ROLES } from '../../database/seed/default-roles';
import {
  CreateInstitutionDto,
  UpdateInstitutionDto,
} from './dto/institution.dto';

@Injectable()
export class InstitutionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(dto: CreateInstitutionDto) {
    const [existing] = await this.db
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.subdomain, dto.subdomain))
      .limit(1);

    if (existing) {
      throw new ConflictException('Subdomain already exists');
    }

    const [institution] = await this.db
      .insert(institutions)
      .values({
        name: dto.name,
        subdomain: dto.subdomain,
        contactEmail: dto.contactEmail,
        logoUrl: dto.logoUrl,
        countryCode: dto.countryCode ?? 'KE',
        timezone: dto.timezone ?? 'Africa/Nairobi',
      })
      .returning();

    await this.db.insert(roles).values(
      DEFAULT_ROLES.map((role) => ({
        ...role,
        institutionId: institution.id,
      })),
    );

    return institution;
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

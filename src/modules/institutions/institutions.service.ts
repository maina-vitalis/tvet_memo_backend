import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { accountSetupTokens, institutions } from '../../database/schema';
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

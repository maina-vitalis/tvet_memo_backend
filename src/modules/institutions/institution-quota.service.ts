import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { institutions, users } from '../../database/schema';

export type InstitutionSeatUsage = {
  active: number;
  quota: number;
  remaining: number;
};

/**
 * Enforces institution seat quotas using the same definition as the admin
 * dashboard: active users at the institution vs institutions.seat_quota.
 */
@Injectable()
export class InstitutionQuotaService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getUsage(institutionId: string): Promise<InstitutionSeatUsage> {
    const [institution] = await this.db
      .select({ seatQuota: institutions.seatQuota })
      .from(institutions)
      .where(eq(institutions.id, institutionId))
      .limit(1);

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const [activeResult] = await this.db
      .select({ count: count() })
      .from(users)
      .where(
        and(eq(users.institutionId, institutionId), eq(users.isActive, true)),
      );

    const active = activeResult?.count ?? 0;
    const quota = institution.seatQuota;
    const remaining = Math.max(0, quota - active);

    return { active, quota, remaining };
  }

  /** Throws when adding countToAdd active users would exceed the seat quota. */
  async assertCanAddUsers(
    institutionId: string,
    countToAdd = 1,
  ): Promise<void> {
    if (countToAdd <= 0) {
      return;
    }

    const { active, quota, remaining } = await this.getUsage(institutionId);

    if (countToAdd > remaining) {
      throw new BadRequestException(
        remaining === 0
          ? `Institution seat quota reached (${active}/${quota}).`
          : `Cannot add ${countToAdd} user(s). Only ${remaining} seat(s) remaining (${active}/${quota}).`,
      );
    }
  }
}

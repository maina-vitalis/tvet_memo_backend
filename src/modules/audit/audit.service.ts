import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { auditLogs, NewAuditLog } from '../../database/schema';

export interface AuditLogInput {
  institutionId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async log(input: AuditLogInput) {
    const record: NewAuditLog = {
      institutionId: input.institutionId,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeState: input.beforeState ?? null,
      afterState: input.afterState ?? null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };

    const [entry] = await this.db.insert(auditLogs).values(record).returning();
    return entry;
  }
}

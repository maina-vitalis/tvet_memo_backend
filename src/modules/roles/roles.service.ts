import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { roles } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditService: AuditService,
  ) {}

  async findAll(institutionId: string) {
    return this.db
      .select()
      .from(roles)
      .where(and(eq(roles.institutionId, institutionId), eq(roles.isActive, true)));
  }

  async findOne(institutionId: string, id: string) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.id, id),
          eq(roles.institutionId, institutionId),
          eq(roles.isActive, true),
        ),
      )
      .limit(1);

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async create(institutionId: string, actorId: string, dto: CreateRoleDto) {
    const [role] = await this.db
      .insert(roles)
      .values({
        institutionId,
        name: dto.name,
        hierarchyLevel: dto.hierarchyLevel,
        sendScope: dto.sendScope ?? {},
        contentAccess: dto.contentAccess ?? {},
        adminRights: dto.adminRights ?? {},
      })
      .returning();

    await this.auditService.log({
      institutionId,
      actorId,
      action: 'role.create',
      entityType: 'role',
      entityId: role.id,
      afterState: role as unknown as Record<string, unknown>,
    });

    return role;
  }

  async update(
    institutionId: string,
    actorId: string,
    id: string,
    dto: UpdateRoleDto,
  ) {
    const before = await this.findOne(institutionId, id);

    const [updated] = await this.db
      .update(roles)
      .set({
        name: dto.name,
        hierarchyLevel: dto.hierarchyLevel,
        sendScope: dto.sendScope,
        contentAccess: dto.contentAccess,
        adminRights: dto.adminRights,
      })
      .where(eq(roles.id, id))
      .returning();

    await this.auditService.log({
      institutionId,
      actorId,
      action: 'role.update',
      entityType: 'role',
      entityId: id,
      beforeState: before as unknown as Record<string, unknown>,
      afterState: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async deactivate(institutionId: string, id: string) {
    await this.findOne(institutionId, id);

    const [updated] = await this.db
      .update(roles)
      .set({ isActive: false })
      .where(eq(roles.id, id))
      .returning();

    return updated;
  }
}

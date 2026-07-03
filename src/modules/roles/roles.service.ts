import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { rolePermissions as rp } from '../../database/schema/role-permissions'; // alias if needed
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { permissions, rolePermissions, roles } from '../../database/schema';
import { rolePermissions as rpTable } from '../../database/schema/role-permissions';
import { AuditService } from '../audit/audit.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditService: AuditService,
  ) {}

  async findAll(institutionId: string) {
    const roleList = await this.db
      .select()
      .from(roles)
      .where(
        and(eq(roles.institutionId, institutionId), eq(roles.isActive, true)),
      );

    // Attach permission keys for convenience (RBAC)
    const withPerms = await Promise.all(
      roleList.map(async (role) => ({
        ...role,
        permissions: await this.getPermissionKeysForRole(role.id),
      })),
    );

    return withPerms;
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

    const perms = await this.getPermissionKeysForRole(role.id);
    return { ...role, permissions: perms };
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

    // [RBAC] Assign permissions if provided (preferred over JSONB)
    await this.assignPermissionsToRole(
      role.id,
      dto.permissionKeys,
      dto.permissionIds,
    );

    await this.auditService.log({
      institutionId,
      actorId,
      action: 'role.create',
      entityType: 'role',
      entityId: role.id,
      afterState: role,
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

    // [RBAC] Replace permissions if provided
    if (dto.permissionKeys || dto.permissionIds) {
      await this.replaceRolePermissions(
        id,
        dto.permissionKeys,
        dto.permissionIds,
      );
    }

    await this.auditService.log({
      institutionId,
      actorId,
      action: 'role.update',
      entityType: 'role',
      entityId: id,
      beforeState: before,
      afterState: updated,
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

  // ====================================================================
  // RBAC Permission Helpers (strict multi-tenant)
  // ====================================================================

  private async assignPermissionsToRole(
    roleId: string,
    permissionKeys?: string[],
    permissionIds?: string[],
  ) {
    const ids = await this.resolvePermissionIds(permissionKeys, permissionIds);
    if (ids.length === 0) return;

    await this.db
      .insert(rolePermissions)
      .values(ids.map((pid) => ({ roleId, permissionId: pid })));
  }

  private async replaceRolePermissions(
    roleId: string,
    permissionKeys?: string[],
    permissionIds?: string[],
  ) {
    // Remove existing
    await this.db.delete(rpTable).where(eq(rpTable.roleId, roleId));

    const ids = await this.resolvePermissionIds(permissionKeys, permissionIds);
    if (ids.length > 0) {
      await this.db
        .insert(rolePermissions)
        .values(ids.map((pid) => ({ roleId, permissionId: pid })));
    }
  }

  private async resolvePermissionIds(
    keys?: string[],
    ids?: string[],
  ): Promise<string[]> {
    const result = new Set<string>();

    if (ids && ids.length > 0) {
      ids.forEach((id) => result.add(id));
    }

    if (keys && keys.length > 0) {
      const found = await this.db
        .select({ id: permissions.id })
        .from(permissions)
        .where(inArray(permissions.key, keys));

      found.forEach((p) => result.add(p.id));
    }

    return Array.from(result);
  }

  /**
   * Get all permission keys for a role (useful for auth context / frontend).
   */
  async getPermissionKeysForRole(roleId: string): Promise<string[]> {
    const rows = await this.db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));

    return rows.map((r) => r.key);
  }
}

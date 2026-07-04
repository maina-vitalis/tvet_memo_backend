import {
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { Role } from '../../common/rbac/role.enum';
import {
  ALLOWED_ROLE_TARGETS,
  MEMO_TARGETING_RULES,
} from '../../common/rbac/memo-targeting';
import { MemoScope } from '../../common/rbac/memo-scope.enum';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { users } from '../../database/schema';

/** [MEMO TARGETING] Sender context for resolving memo recipients. */
export interface MemoSender {
  id: string;
  role: Role;
  institutionId: string | null;
  departmentId: string | null;
  cohortId: string | null;
}

export interface TargetMemoInput {
  scope: MemoScope;
  roles?: Role[];
  targetInstitutionId?: string;
}

/** [MEMO TARGETING] Validates scope/role rules and resolves recipient user IDs. */
@Injectable()
export class MemoTargetingService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async resolveRecipients(
    sender: MemoSender,
    input: TargetMemoInput,
  ): Promise<string[]> {
    this.assertScopeAllowed(sender, input.scope);
    const roleFilter = this.assertRolesAllowed(sender, input.roles);

    switch (input.scope) {
      case MemoScope.SYSTEM_WIDE:
        return this.resolveSystemWide(roleFilter);
      case MemoScope.INSTITUTION_WIDE:
        return this.resolveInstitutionWide(
          sender,
          roleFilter,
          input.targetInstitutionId,
        );
      case MemoScope.BOARD:
        return this.resolveBoard(sender, roleFilter);
      case MemoScope.DEPARTMENT:
        return this.resolveDepartment(sender, roleFilter);
      case MemoScope.COHORT:
        return this.resolveCohort(sender, roleFilter);
      default:
        throw new ForbiddenException(`Unhandled memo scope: ${input.scope}`);
    }
  }

  private assertScopeAllowed(sender: MemoSender, scope: MemoScope): void {
    const allowed = MEMO_TARGETING_RULES[sender.role] ?? [];
    if (!allowed.includes(scope)) {
      throw new ForbiddenException(
        `Role ${sender.role} is not permitted to target scope ${scope}`,
      );
    }
  }

  private assertRolesAllowed(
    sender: MemoSender,
    roles?: Role[],
  ): Role[] | undefined {
    if (!roles || roles.length === 0) return undefined;

    const permitted = ALLOWED_ROLE_TARGETS[sender.role] ?? [];
    const disallowed = roles.filter((r) => !permitted.includes(r));

    if (disallowed.length > 0) {
      throw new ForbiddenException(
        `Role ${sender.role} cannot target: ${disallowed.join(', ')}`,
      );
    }

    return roles;
  }

  private async resolveSystemWide(roleFilter?: Role[]): Promise<string[]> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          roleFilter ? inArray(users.role, roleFilter) : undefined,
        ),
      );
    return rows.map((r) => r.id);
  }

  private async resolveInstitutionWide(
    sender: MemoSender,
    roleFilter?: Role[],
    targetInstitutionId?: string,
  ): Promise<string[]> {
    const institutionId =
      sender.role === Role.SUPER_ADMIN
        ? targetInstitutionId
        : sender.institutionId;

    if (!institutionId) {
      throw new ForbiddenException('No institution context available');
    }

    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.institutionId, institutionId),
          eq(users.isActive, true),
          roleFilter ? inArray(users.role, roleFilter) : undefined,
        ),
      );
    return rows.map((r) => r.id);
  }

  private async resolveBoard(
    sender: MemoSender,
    roleFilter?: Role[],
  ): Promise<string[]> {
    if (!sender.institutionId) {
      throw new ForbiddenException('Board scope requires an institution context');
    }

    const boardRoles = [Role.CHAIRPERSON, Role.BOARD_MEMBER];
    const effectiveRoles = roleFilter
      ? boardRoles.filter((r) => roleFilter.includes(r))
      : boardRoles;

    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.institutionId, sender.institutionId),
          inArray(users.role, effectiveRoles),
          eq(users.isActive, true),
        ),
      );
    return rows.map((r) => r.id);
  }

  private async resolveDepartment(
    sender: MemoSender,
    roleFilter?: Role[],
  ): Promise<string[]> {
    if (!sender.departmentId) {
      throw new ForbiddenException('Department scope requires a department context');
    }

    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.departmentId, sender.departmentId),
          eq(users.isActive, true),
          roleFilter ? inArray(users.role, roleFilter) : undefined,
        ),
      );
    return rows.map((r) => r.id);
  }

  private async resolveCohort(
    sender: MemoSender,
    roleFilter?: Role[],
  ): Promise<string[]> {
    if (!sender.cohortId) {
      throw new ForbiddenException('Cohort scope requires a cohort context');
    }

    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.cohortId, sender.cohortId),
          eq(users.isActive, true),
          roleFilter ? inArray(users.role, roleFilter) : undefined,
        ),
      );
    return rows.map((r) => r.id);
  }
}
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, eq, ne } from 'drizzle-orm';
import { assertActorInstitution } from '../../common/rbac/assert-actor-institution';
import { canAssignRole } from '../../common/rbac/can-assign-role';
import { Role } from '../../common/rbac/role.enum';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { institutions, users } from '../../database/schema';
import { sanitizeUser } from '../../common/utils/crypto.util';
import { AuditService } from '../audit/audit.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserRoleDto,
} from './dto/user.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
  ) {}

  async findAll(institutionId: string) {
    const rows = await this.db
      .select()
      .from(users)
      .where(
        and(eq(users.institutionId, institutionId), eq(users.isActive, true)),
      );

    return rows.map((user) => sanitizeUser(user));
  }

  async findOne(institutionId: string, id: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, id),
          eq(users.institutionId, institutionId),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return sanitizeUser(user);
  }

  private async assertInstitutionAdminRetained(
    institutionId: string,
    targetUserId: string,
    newRole?: Role,
    deactivating = false,
  ): Promise<void> {
    const [target] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!target) return;

    const wouldRemoveAdmin =
      deactivating ||
      (newRole !== undefined &&
        (target.role as Role) === Role.INSTITUTION_ADMIN &&
        newRole !== Role.INSTITUTION_ADMIN);

    if (!wouldRemoveAdmin) return;

    const [remaining] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.institutionId, institutionId),
          eq(users.role, Role.INSTITUTION_ADMIN),
          eq(users.isActive, true),
          ne(users.id, targetUserId),
        ),
      )
      .limit(1);

    if (!remaining) {
      throw new BadRequestException(
        'Institution must retain at least one active INSTITUTION_ADMIN',
      );
    }
  }

  async create(
    institutionId: string,
    actor: AuthenticatedUser,
    dto: CreateUserDto,
  ) {
    assertActorInstitution(actor, institutionId);

    if (!canAssignRole(actor, dto.role)) {
      throw new ForbiddenException(`Cannot assign role ${dto.role}`);
    }

    const email = dto.email.toLowerCase();

    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const [user] = await this.db
      .insert(users)
      .values({
        institutionId,
        role: dto.role,
        departmentId: dto.departmentId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email,
        staffNumber: dto.staffNumber,
        phoneNumber: dto.phoneNumber,
        passwordHash,
        mustChangePassword: false,
      })
      .returning();

    await this.auditService.log({
      institutionId,
      actorId: actor.id,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      afterState: sanitizeUser(user),
    });

    return sanitizeUser(user);
  }

  async update(
    institutionId: string,
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateUserDto,
  ) {
    assertActorInstitution(actor, institutionId);
    const before = await this.findOne(institutionId, id);

    if (dto.role && !canAssignRole(actor, dto.role)) {
      throw new ForbiddenException(`Cannot assign role ${dto.role}`);
    }

    if (dto.role && dto.role !== before.role) {
      await this.assertInstitutionAdminRetained(institutionId, id, dto.role);
    }

    const [updated] = await this.db
      .update(users)
      .set({
        role: dto.role,
        departmentId: dto.departmentId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
      })
      .where(eq(users.id, id))
      .returning();

    if (dto.role && dto.role !== before.role) {
      await this.auditService.log({
        institutionId,
        actorId: actor.id,
        action: 'user.role_assign',
        entityType: 'user',
        entityId: id,
        beforeState: { role: before.role },
        afterState: { role: dto.role },
      });
    }

    return sanitizeUser(updated);
  }

  /** [RBAC] Role update with ceiling check — separate from general profile update. */
  async updateRole(
    institutionId: string,
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateUserRoleDto,
  ) {
    assertActorInstitution(actor, institutionId);

    if (!canAssignRole(actor, dto.role)) {
      throw new ForbiddenException(`Cannot assign role ${dto.role}`);
    }

    await this.assertInstitutionAdminRetained(institutionId, id, dto.role);

    const before = await this.findOne(institutionId, id);

    const [updated] = await this.db
      .update(users)
      .set({ role: dto.role })
      .where(eq(users.id, id))
      .returning();

    await this.auditService.log({
      institutionId,
      actorId: actor.id,
      action: 'user.role_assign',
      entityType: 'user',
      entityId: id,
      beforeState: { role: before.role },
      afterState: { role: dto.role },
    });

    return sanitizeUser(updated);
  }

  async deactivate(
    institutionId: string,
    actor: AuthenticatedUser,
    id: string,
  ) {
    assertActorInstitution(actor, institutionId);
    await this.assertInstitutionAdminRetained(
      institutionId,
      id,
      undefined,
      true,
    );
    await this.findOne(institutionId, id);

    const [updated] = await this.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, id))
      .returning();

    await this.auditService.log({
      institutionId,
      actorId: actor.id,
      action: 'user.deactivate',
      entityType: 'user',
      entityId: id,
    });

    return sanitizeUser(updated);
  }

  async provision(
    institutionId: string,
    actor: AuthenticatedUser,
    dto: ProvisionUserDto,
  ) {
    assertActorInstitution(actor, institutionId);

    if (!canAssignRole(actor, dto.role)) {
      throw new ForbiddenException(`Cannot assign role ${dto.role}`);
    }

    const email = dto.email.toLowerCase();

    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // Generate a human-readable temporary password (word + number).
    // mustChangePassword = true ensures they are forced to change it on first login.
    const tempPassword = this.generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword, {
      type: argon2.argon2id,
    });

    const [user] = await this.db
      .insert(users)
      .values({
        institutionId,
        role: dto.role,
        departmentId: dto.departmentId || null,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email,
        admissionNumber: dto.admissionNumber || null,
        staffNumber: dto.staffNumber || null,
        phoneNumber: dto.phoneNumber || null,
        passwordHash,
        mustChangePassword: true,
      })
      .returning();

    // Look up the institution's school code so we can include it in the email.
    const [institution] = await this.db
      .select({ schoolCode: institutions.schoolCode, name: institutions.name })
      .from(institutions)
      .where(eq(institutions.id, institutionId))
      .limit(1);

    // Send credentials email — school code + login identifier + temp password.
    // admissionNumber is used for students; staffNumber for staff.
    // The mobile code-auth flow handles the rest — no setup link needed.
    const loginIdentifier = user.admissionNumber ?? user.staffNumber ?? '';
    const loginIdentifierLabel = user.admissionNumber
      ? 'Admission Number'
      : 'Staff Number';

    try {
      await this.emailService.sendProvisioningCredentials({
        to: email,
        firstName: user.firstName,
        schoolCode: institution?.schoolCode ?? 'N/A',
        tempPassword,
        loginIdentifier,
        loginIdentifierLabel,
        institutionName: institution?.name,
      });
    } catch (emailError) {
      // Non-fatal: user is already created. Admin can resend / communicate manually.
      console.error('Provisioning email failed:', emailError);
    }

    await this.auditService.log({
      institutionId,
      actorId: actor.id,
      action: 'user.provision',
      entityType: 'user',
      entityId: user.id,
      afterState: sanitizeUser(user),
    });

    return sanitizeUser(user);
  }

  /** Generate a memorable temporary password: adjective + noun + 4-digit number. */
  private generateTempPassword(): string {
    const adjectives = [
      'Swift',
      'Bold',
      'Calm',
      'Keen',
      'Wise',
      'Bright',
      'Clear',
      'Sure',
    ];
    const nouns = [
      'River',
      'Stone',
      'Cloud',
      'Field',
      'Bridge',
      'Tower',
      'Forest',
      'Peak',
    ];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${adj}${noun}${num}`;
  }
}

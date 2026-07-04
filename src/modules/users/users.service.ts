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
import { canAssignRole } from '../../common/rbac/can-assign-role';
import { Role } from '../../common/rbac/role.enum';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { accountSetupTokens, users } from '../../database/schema';
import {
  generateSetupToken,
  hashToken,
  sanitizeUser,
} from '../../common/utils/crypto.util';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto, UpdateUserRoleDto } from './dto/user.dto';
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

  private assertActorInstitution(
    actor: AuthenticatedUser,
    institutionId: string,
  ): void {
    if (actor.role === Role.SUPER_ADMIN) return;
    if (actor.institutionId !== institutionId) {
      throw new ForbiddenException('Cannot manage users outside your institution');
    }
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
        target.role === Role.INSTITUTION_ADMIN &&
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
    this.assertActorInstitution(actor, institutionId);

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
    this.assertActorInstitution(actor, institutionId);
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
    this.assertActorInstitution(actor, institutionId);

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
    this.assertActorInstitution(actor, institutionId);
    await this.assertInstitutionAdminRetained(institutionId, id, undefined, true);
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
    this.assertActorInstitution(actor, institutionId);

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

    const tempPassword = Math.random().toString(36).slice(-12);
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
        staffNumber: dto.staffNumber || null,
        phoneNumber: dto.phoneNumber || null,
        passwordHash,
        mustChangePassword: true,
      })
      .returning();

    const token = generateSetupToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.db.insert(accountSetupTokens).values({
      institutionId,
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const setupLink = `http://localhost:8081/(auth)/password?mode=setup&token=${token}&email=${encodeURIComponent(email)}`;

    try {
      await this.emailService.sendAccountSetupLink(
        email,
        setupLink,
        user.firstName,
      );
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
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
}
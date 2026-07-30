import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, eq, inArray, ne, or } from 'drizzle-orm';
import { assertActorInstitution } from '../../common/rbac/assert-actor-institution';
import { canAssignRole } from '../../common/rbac';
import { Role } from '../../common/rbac';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import {
  accountSetupTokens,
  attachments,
  auditLogs,
  departments,
  institutions,
  memoRecipients,
  memos,
  messageThreads,
  notifications,
  sessions,
  userPushTokens,
  users,
} from '../../database/schema';
import { sanitizeUser } from '../../common/utils/crypto.util';
import { AuditService } from '../audit/audit.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserRoleDto,
} from './dto/user.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { EmailService } from '../email/email.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { InstitutionQuotaService } from '../institutions/institution-quota.service';
import {
  buildProvisionedTraineeAccount,
  hashProvisionedPassword,
} from './provisioned-account.service';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly institutionQuotaService: InstitutionQuotaService,
  ) {}

  async findAll(institutionId: string) {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.institutionId, institutionId));

    return rows.map((user) => sanitizeUser(user));
  }

  async findOne(institutionId: string, id: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.institutionId, institutionId)))
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

    await this.institutionQuotaService.assertCanAddUsers(institutionId);

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
        phoneNumber: dto.phoneNumber,
        passwordHash,
        mustChangePassword: false,
        emailVerified: true,
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

    if (dto.isActive === false && before.isActive) {
      await this.assertInstitutionAdminRetained(
        institutionId,
        id,
        undefined,
        true,
      );
    }

    const [updated] = await this.db
      .update(users)
      .set({
        role: dto.role,
        departmentId: dto.departmentId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
        isActive: dto.isActive,
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

    if (dto.isActive !== undefined && dto.isActive !== before.isActive) {
      await this.auditService.log({
        institutionId,
        actorId: actor.id,
        action: dto.isActive ? 'user.activate' : 'user.deactivate',
        entityType: 'user',
        entityId: id,
        beforeState: { isActive: before.isActive },
        afterState: { isActive: dto.isActive },
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

  /** Hard delete — permanently removes the user along with every memo they
   * sent (and that memo's recipients/notifications/attachments/threads
   * institution-wide), their own recipient records, sessions, and tokens,
   * since none of those FKs cascade at the DB level. Department headship and
   * audit log authorship are detached (set to null) rather than deleted, so
   * the institution's org chart and audit trail stay intact. */
  async remove(institutionId: string, actor: AuthenticatedUser, id: string) {
    assertActorInstitution(actor, institutionId);

    if (actor.id === id) {
      throw new BadRequestException('You cannot delete your own account');
    }

    await this.assertInstitutionAdminRetained(
      institutionId,
      id,
      undefined,
      true,
    );

    const [target] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.institutionId, institutionId)))
      .limit(1);

    if (!target) {
      throw new NotFoundException('User not found');
    }

    const sentMemoRows = await this.db
      .select({ id: memos.id })
      .from(memos)
      .where(eq(memos.senderId, id));
    const sentMemoIds = sentMemoRows.map((row) => row.id);

    await this.db.transaction(async (tx) => {
      if (sentMemoIds.length > 0) {
        await tx
          .delete(memoRecipients)
          .where(inArray(memoRecipients.memoId, sentMemoIds));
        await tx
          .delete(notifications)
          .where(inArray(notifications.memoId, sentMemoIds));
        await tx
          .delete(attachments)
          .where(inArray(attachments.memoId, sentMemoIds));
        await tx
          .delete(messageThreads)
          .where(inArray(messageThreads.memoId, sentMemoIds));
      }

      await tx.delete(memoRecipients).where(eq(memoRecipients.userId, id));
      await tx.delete(notifications).where(eq(notifications.userId, id));
      await tx.delete(attachments).where(eq(attachments.uploadedBy, id));
      await tx
        .delete(messageThreads)
        .where(
          or(
            eq(messageThreads.senderId, id),
            eq(messageThreads.recipientId, id),
          ),
        );

      if (sentMemoIds.length > 0) {
        await tx.delete(memos).where(eq(memos.senderId, id));
      }

      await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx
        .delete(accountSetupTokens)
        .where(eq(accountSetupTokens.userId, id));

      await tx
        .update(departments)
        .set({ headUserId: null })
        .where(eq(departments.headUserId, id));
      await tx
        .update(auditLogs)
        .set({ actorId: null })
        .where(eq(auditLogs.actorId, id));

      await tx.delete(users).where(eq(users.id, id));
    });

    await this.auditService.log({
      institutionId,
      actorId: actor.id,
      action: 'user.delete',
      entityType: 'user',
      entityId: id,
      beforeState: {
        email: target.email,
        firstName: target.firstName,
        lastName: target.lastName,
        role: target.role,
        sentMemoCount: sentMemoIds.length,
      },
    });

    return { id };
  }

  async provision(
    institutionId: string,
    actor: AuthenticatedUser,
    dto: ProvisionUserDto,
  ) {
    assertActorInstitution(actor, institutionId);

    const email = dto.email.toLowerCase();

    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const [existingAdmission] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.institutionId, institutionId),
          eq(users.admissionNumber, dto.admissionNumber),
        ),
      )
      .limit(1);

    if (existingAdmission) {
      throw new ConflictException(
        'Admission number already registered at this institution',
      );
    }

    await this.institutionQuotaService.assertCanAddUsers(institutionId);

    const { values, initialPassword } = buildProvisionedTraineeAccount({
      institutionId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      admissionNumber: dto.admissionNumber,
      email,
      departmentId: dto.departmentId,
      phoneNumber: dto.phoneNumber,
    });

    values.passwordHash = await hashProvisionedPassword(dto.admissionNumber);

    const [user] = await this.db.insert(users).values(values).returning();

    const [institution] = await this.db
      .select({ schoolCode: institutions.schoolCode, name: institutions.name })
      .from(institutions)
      .where(eq(institutions.id, institutionId))
      .limit(1);

    try {
      await this.emailService.sendProvisioningCredentials({
        to: email,
        firstName: user.firstName,
        schoolCode: institution?.schoolCode ?? 'N/A',
        tempPassword: initialPassword,
        admissionNumber: user.admissionNumber!,
        institutionName: institution?.name,
      });
    } catch (emailError) {
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

  /** [SELF-SERVICE] Combined profile edit — text fields and/or avatar in one write. */
  async updateMyProfile(
    userId: string,
    dto: UpdateMyProfileDto,
    file?: Express.Multer.File,
  ) {
    let avatarUrl: string | undefined;

    if (file) {
      const result = await this.cloudinaryService.uploadBuffer(file.buffer, {
        folder: 'memo/avatars',
        public_id: userId,
        overwrite: true,
        invalidate: true,
        resource_type: 'image',
        transformation: [
          { width: 512, height: 512, crop: 'fill', gravity: 'face' },
        ],
      });
      avatarUrl = result.secure_url;
    }

    const [updated] = await this.db
      .update(users)
      .set({
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phoneNumber !== undefined && { phoneNumber: dto.phoneNumber }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return sanitizeUser(updated);
  }

  async upsertPushToken(
    userId: string,
    dto: RegisterPushTokenDto,
  ): Promise<{ registered: true }> {
    const now = new Date();

    await this.db.transaction(async (tx) => {
      // Clear rows that would violate token or user+device uniqueness.
      // Same Expo token can be re-registered after account switch or device id drift.
      await tx
        .delete(userPushTokens)
        .where(
          or(
            eq(userPushTokens.token, dto.token),
            and(
              eq(userPushTokens.userId, userId),
              eq(userPushTokens.deviceId, dto.deviceId),
            ),
          ),
        );

      await tx.insert(userPushTokens).values({
        userId,
        token: dto.token,
        deviceId: dto.deviceId,
        deviceName: dto.deviceName,
        isActive: true,
        lastUsedAt: now,
      });
    });

    return { registered: true };
  }

  async deactivatePushToken(
    userId: string,
    token: string,
  ): Promise<{ deactivated: true }> {
    await this.db
      .update(userPushTokens)
      .set({ isActive: false })
      .where(
        and(eq(userPushTokens.userId, userId), eq(userPushTokens.token, token)),
      );

    return { deactivated: true };
  }
}

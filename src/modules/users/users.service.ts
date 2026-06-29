import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { users, accountSetupTokens } from '../../database/schema';
import { sanitizeUser, generateSetupToken, hashToken } from '../../common/utils/crypto.util';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
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

  async create(institutionId: string, actorId: string, dto: CreateUserDto) {
    const email = dto.email.toLowerCase();

    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.institutionId, institutionId), eq(users.email, email)),
      )
      .limit(1);

    if (existing) {
      throw new ConflictException(
        'Email already registered in this institution',
      );
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const [user] = await this.db
      .insert(users)
      .values({
        institutionId,
        roleId: dto.roleId,
        departmentId: dto.departmentId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email,
        staffNumber: dto.staffNumber,
        phoneNumber: dto.phoneNumber,
        passwordHash,
      })
      .returning();

    await this.auditService.log({
      institutionId,
      actorId,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      afterState: sanitizeUser(user),
    });

    return sanitizeUser(user);
  }

  async update(
    institutionId: string,
    actorId: string,
    id: string,
    dto: UpdateUserDto,
  ) {
    const before = await this.findOne(institutionId, id);

    const [updated] = await this.db
      .update(users)
      .set({
        roleId: dto.roleId,
        departmentId: dto.departmentId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
      })
      .where(eq(users.id, id))
      .returning();

    if (dto.roleId && dto.roleId !== before.roleId) {
      await this.auditService.log({
        institutionId,
        actorId,
        action: 'user.role_assign',
        entityType: 'user',
        entityId: id,
        beforeState: { roleId: before.roleId },
        afterState: { roleId: dto.roleId },
      });
    }

    if (
      dto.departmentId !== undefined &&
      dto.departmentId !== before.departmentId
    ) {
      await this.auditService.log({
        institutionId,
        actorId,
        action: 'user.dept_assign',
        entityType: 'user',
        entityId: id,
        beforeState: { departmentId: before.departmentId },
        afterState: { departmentId: dto.departmentId },
      });
    }

    return sanitizeUser(updated);
  }

  async deactivate(institutionId: string, actorId: string, id: string) {
    await this.findOne(institutionId, id);

    const [updated] = await this.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, id))
      .returning();

    await this.auditService.log({
      institutionId,
      actorId,
      action: 'user.deactivate',
      entityType: 'user',
      entityId: id,
    });

    return sanitizeUser(updated);
  }

  async provision(
    institutionId: string,
    actorId: string,
    dto: ProvisionUserDto,
  ) {
    try {
      const email = dto.email.toLowerCase();

      const [existing] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.institutionId, institutionId), eq(users.email, email)),
        )
        .limit(1);

      if (existing) {
        throw new ConflictException(
          'Email already registered in this institution',
        );
      }

      // Generate temporary password (will be changed during account setup)
      const tempPassword = Math.random().toString(36).slice(-12);
      const passwordHash = await argon2.hash(tempPassword, {
        type: argon2.argon2id,
      });

      const [user] = await this.db
        .insert(users)
        .values({
          institutionId,
          roleId: dto.roleId,
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

      // Generate account setup token
      const token = generateSetupToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await this.db.insert(accountSetupTokens).values({
        institutionId,
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      // Generate setup link for mobile app
      const setupLink = `http://localhost:8081/(auth)/password?mode=setup&token=${token}&email=${encodeURIComponent(email)}`;

      // Send email with setup link
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
        actorId,
        action: 'user.provision',
        entityType: 'user',
        entityId: user.id,
        afterState: sanitizeUser(user),
      });

      return sanitizeUser(user);
    } catch (error) {
      console.error('Provision error:', error);
      throw error;
    }
  }
}

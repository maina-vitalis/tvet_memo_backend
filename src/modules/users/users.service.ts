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
import { users } from '../../database/schema';
import { sanitizeUser } from '../../common/utils/crypto.util';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditService: AuditService,
  ) {}

  async findAll(institutionId: string) {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.institutionId, institutionId), eq(users.isActive, true)));

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
      .where(and(eq(users.institutionId, institutionId), eq(users.email, email)))
      .limit(1);

    if (existing) {
      throw new ConflictException('Email already registered in this institution');
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

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
      afterState: sanitizeUser(user) as Record<string, unknown>,
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

    if (dto.departmentId !== undefined && dto.departmentId !== before.departmentId) {
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
}

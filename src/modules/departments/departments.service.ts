import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import { departments } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditService: AuditService,
  ) {}

  async findAll(institutionId: string) {
    return this.db
      .select()
      .from(departments)
      .where(
        and(
          eq(departments.institutionId, institutionId),
          eq(departments.isActive, true),
        ),
      );
  }

  async findOne(institutionId: string, id: string) {
    const [department] = await this.db
      .select()
      .from(departments)
      .where(
        and(
          eq(departments.id, id),
          eq(departments.institutionId, institutionId),
          eq(departments.isActive, true),
        ),
      )
      .limit(1);

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  async create(
    institutionId: string,
    actorId: string,
    dto: CreateDepartmentDto,
  ) {
    const existing = await this.db
      .select({ id: departments.id })
      .from(departments)
      .where(
        and(
          eq(departments.institutionId, institutionId),
          eq(departments.name, dto.name),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException(
        'A department with this name already exists in your institution',
      );
    }

    const [department] = await this.db
      .insert(departments)
      .values({
        institutionId,
        name: dto.name,
        code: dto.code,
        headUserId: dto.headUserId,
      })
      .returning();

    await this.auditService.log({
      institutionId,
      actorId,
      action: 'department.create',
      entityType: 'department',
      entityId: department.id,
      afterState: { name: department.name, code: department.code },
    });

    return department;
  }

  async update(
    institutionId: string,
    actorId: string,
    id: string,
    dto: UpdateDepartmentDto,
  ) {
    await this.findOne(institutionId, id);

    const [updated] = await this.db
      .update(departments)
      .set({
        name: dto.name,
        code: dto.code,
        headUserId: dto.headUserId,
      })
      .where(eq(departments.id, id))
      .returning();

    if (dto.headUserId) {
      await this.auditService.log({
        institutionId,
        actorId,
        action: 'user.dept_assign',
        entityType: 'department',
        entityId: id,
        afterState: { headUserId: dto.headUserId },
      });
    }

    return updated;
  }

  async deactivate(institutionId: string, id: string) {
    await this.findOne(institutionId, id);

    const [updated] = await this.db
      .update(departments)
      .set({ isActive: false })
      .where(eq(departments.id, id))
      .returning();

    return updated;
  }
}

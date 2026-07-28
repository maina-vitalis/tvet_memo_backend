import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, ilike, inArray, isNull, or } from 'drizzle-orm';
import { Request } from 'express';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import {
  attachments,
  memoRecipients,
  memos,
  messageThreads,
  notifications,
  users,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { Role } from '../../common/rbac/role.enum';
import { Permission } from '../../common/rbac/permission.enum';
import { ROLE_PERMISSIONS } from '../../common/rbac/role-permissions';
import { ROLE_RANK } from '../../common/rbac/role-rank';
import {
  CreateMemoDto,
  MemoTargetTypeDto,
  UpdateMemoDto,
} from './dto/memo.dto';
import {
  MemoAttachmentsService,
} from './memo-attachments.service';
import {
  memoBodyPreview,
  normalizeMemoBody,
} from './utils/memo-body.util';

@Injectable()
export class MemosService {
  private readonly logger = new Logger(MemosService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly memoAttachmentsService: MemoAttachmentsService,
  ) {}

  async findSent(institutionId: string, senderId: string) {
    return this.db
      .select()
      .from(memos)
      .where(
        and(
          eq(memos.institutionId, institutionId),
          eq(memos.senderId, senderId),
        ),
      );
  }

  async findInbox(institutionId: string, userId: string) {
    return this.db
      .select({
        memo: memos,
        recipient: memoRecipients,
      })
      .from(memoRecipients)
      .innerJoin(memos, eq(memoRecipients.memoId, memos.id))
      .where(
        and(
          eq(memoRecipients.userId, userId),
          eq(memos.institutionId, institutionId),
          or(isNull(memos.expiresAt), gt(memos.expiresAt, new Date())),
        ),
      )
      .orderBy(desc(memos.sentAt), desc(memos.createdAt));
  }

  async findOne(
    institutionId: string,
    userId: string,
    userRole: Role,
    id: string,
  ) {
    const memo = await this.findMemoRow(institutionId, id);
    await this.assertMemoReadable(memo, userId, userRole);

    const attachmentList =
      await this.memoAttachmentsService.listForMemo(memo.id);

    return {
      ...memo,
      attachments: attachmentList,
    };
  }

  private async findMemoRow(institutionId: string, id: string) {
    const [memo] = await this.db
      .select()
      .from(memos)
      .where(and(eq(memos.id, id), eq(memos.institutionId, institutionId)))
      .limit(1);

    if (!memo) {
      throw new NotFoundException('Memo not found');
    }

    return memo;
  }

  async archive(institutionId: string, actorId: string, id: string) {
    const memo = await this.findMemoRow(institutionId, id);

    if (memo.status === 'archived') {
      return memo;
    }

    const [updated] = await this.db
      .update(memos)
      .set({ status: 'archived' })
      .where(eq(memos.id, id))
      .returning();

    await this.auditService.log({
      institutionId,
      actorId,
      action: 'memo.archive',
      entityType: 'memo',
      entityId: id,
      beforeState: { status: memo.status },
      afterState: { status: 'archived' },
    });

    return updated;
  }

  /** Hard delete — permanently removes the memo along with its recipient
   * read-receipts, notifications, attachments, and message threads, since
   * none of those FKs cascade at the DB level. */
  async remove(institutionId: string, actorId: string, id: string) {
    const memo = await this.findMemoRow(institutionId, id);

    await this.db.transaction(async (tx) => {
      await tx.delete(memoRecipients).where(eq(memoRecipients.memoId, id));
      await tx.delete(notifications).where(eq(notifications.memoId, id));
      await tx.delete(attachments).where(eq(attachments.memoId, id));
      await tx.delete(messageThreads).where(eq(messageThreads.memoId, id));
      await tx.delete(memos).where(eq(memos.id, id));
    });

    await this.auditService.log({
      institutionId,
      actorId,
      action: 'memo.delete',
      entityType: 'memo',
      entityId: id,
      beforeState: {
        subject: memo.subject,
        status: memo.status,
        senderId: memo.senderId,
      },
    });

    return { id };
  }

  async create(institutionId: string, senderId: string, dto: CreateMemoDto) {
    await this.assertTargetPayloadAllowed(
      senderId,
      dto.targetType,
      dto.targetPayload,
    );

    const normalizedBody = normalizeMemoBody(dto.body, dto.bodyFormat);

    const [memo] = await this.db
      .insert(memos)
      .values({
        institutionId,
        senderId,
        subject: dto.subject,
        body: normalizedBody.body,
        bodyFormat: normalizedBody.bodyFormat,
        priority: dto.priority ?? 'normal',
        category: dto.category,
        status: 'draft',
        targetType: dto.targetType,
        targetPayload: dto.targetPayload ?? {},
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      })
      .returning();

    return memo;
  }

  /** Create, attach files (optional), and send in one flow for mobile. */
  async publishWithAttachments(
    institutionId: string,
    senderId: string,
    dto: CreateMemoDto,
    files: Express.Multer.File[] | undefined,
    req: Request,
  ) {
    const memo = await this.create(institutionId, senderId, dto);

    if (files?.length) {
      for (const file of files) {
        await this.memoAttachmentsService.upload(
          institutionId,
          memo.id,
          senderId,
          file,
        );
      }
    }

    return this.send(institutionId, senderId, memo.id, req);
  }

  /** Create and send in one request — avoids a slow second round-trip on mobile. */
  async publish(
    institutionId: string,
    senderId: string,
    dto: CreateMemoDto,
    req: Request,
  ) {
    const memo = await this.create(institutionId, senderId, dto);
    return this.send(institutionId, senderId, memo.id, req);
  }

  //Edit and update memo
  async update(
    institutionId: string,
    senderId: string,
    id: string,
    dto: UpdateMemoDto,
  ) {
    const memo = await this.findMemoRow(institutionId, id);

    if (memo.senderId !== senderId) {
      throw new ForbiddenException('Only the sender can edit this memo');
    }

    if (memo.status !== 'draft') {
      throw new BadRequestException('Only draft memos can be edited');
    }

    if (dto.targetType || dto.targetPayload) {
      await this.assertTargetPayloadAllowed(
        senderId,
        (dto.targetType ?? memo.targetType) as MemoTargetTypeDto,
        dto.targetPayload ?? (memo.targetPayload as Record<string, unknown>),
      );
    }

    const normalizedBody =
      dto.body !== undefined
        ? normalizeMemoBody(
            dto.body,
            (dto.bodyFormat ?? memo.bodyFormat) as 'plain' | 'html',
          )
        : null;

    const [updated] = await this.db
      .update(memos)
      .set({
        subject: dto.subject,
        body: normalizedBody?.body ?? dto.body,
        bodyFormat: normalizedBody?.bodyFormat,
        priority: dto.priority,
        category: dto.category,
        targetType: dto.targetType,
        targetPayload: dto.targetPayload,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      })
      .where(eq(memos.id, id))
      .returning();

    return updated;
  }

  //send the push notifications
  async send(
    institutionId: string,
    senderId: string,
    id: string,
    req: Request,
  ) {
    const memo = await this.findMemoRow(institutionId, id);

    if (memo.senderId !== senderId) {
      throw new ForbiddenException('Only the sender can send this memo');
    }

    if (memo.status !== 'draft') {
      throw new BadRequestException('Memo has already been sent');
    }

    const recipientIds = await this.resolveRecipients(
      institutionId,
      memo,
      senderId,
    );

    if (recipientIds.length === 0) {
      throw new BadRequestException(
        'No recipients matched the target criteria',
      );
    }

    const sent = await this.db.transaction(async (tx) => {
      await tx.insert(memoRecipients).values(
        recipientIds.map((userId) => ({
          memoId: id,
          userId,
        })),
      );

      const [updated] = await tx
        .update(memos)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(memos.id, id))
        .returning();

      return updated;
    });

    await this.auditService.log({
      institutionId,
      actorId: senderId,
      action: 'memo.send',
      entityType: 'memo',
      entityId: id,
      afterState: {
        recipientCount: recipientIds.length,
        status: 'sent',
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    // Do not block the HTTP response on Redis — push is async and a slow/unreachable
    // Redis must not cause client timeouts or skip enqueue after the memo is already sent.
    void this.notificationsService
      .enqueueMemoNotification({
        memoId: id,
        institutionId,
        recipientIds,
        subject: sent.subject,
        body: memoBodyPreview(sent.body, sent.bodyFormat as 'plain' | 'html'),
        priority: sent.priority,
        category: sent.category,
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to enqueue push job for memo ${id}. Recipients were saved but no push will fire until Redis is available.`,
          error instanceof Error ? error.stack : String(error),
        );
      });

    return { memo: sent, recipientCount: recipientIds.length };
  }

  /** Re-enqueue push for recipients who failed or were never notified. */
  async retryPushNotification(
    institutionId: string,
    actorId: string,
    actorRole: Role,
    memoId: string,
  ) {
    const memo = await this.findMemoRow(institutionId, memoId);

    if (memo.status !== 'sent') {
      throw new BadRequestException(
        'Push retry is only available for sent memos',
      );
    }

    const permissions = ROLE_PERMISSIONS[actorRole] ?? [];
    const canManage = permissions.includes(Permission.MANAGE_MEMOS);

    if (memo.senderId !== actorId && !canManage) {
      throw new ForbiddenException(
        'Not allowed to retry push for this memo',
      );
    }

    const recipientRows = await this.db
      .select({ userId: memoRecipients.userId })
      .from(memoRecipients)
      .where(eq(memoRecipients.memoId, memoId));

    const recipientIds = recipientRows.map((row) => row.userId);

    if (recipientIds.length === 0) {
      throw new BadRequestException('No recipients for this memo');
    }

    await this.notificationsService.enqueueMemoNotification(
      {
        memoId,
        institutionId,
        recipientIds,
        subject: memo.subject,
        body: memoBodyPreview(
          memo.body,
          memo.bodyFormat as 'plain' | 'html',
        ),
        priority: memo.priority,
        category: memo.category,
      },
      { isRetry: true },
    );

    return { enqueued: true, recipientCount: recipientIds.length };
  }

  //mark the memo read
  async markRead(institutionId: string, userId: string, memoId: string) {
    await this.findMemoRow(institutionId, memoId);

    const [recipient] = await this.db
      .select()
      .from(memoRecipients)
      .where(
        and(
          eq(memoRecipients.memoId, memoId),
          eq(memoRecipients.userId, userId),
        ),
      )
      .limit(1);

    if (!recipient) {
      throw new ForbiddenException('You are not a recipient of this memo');
    }

    if (recipient.readAt) {
      return recipient;
    }

    const [updated] = await this.db
      .update(memoRecipients)
      .set({ readAt: new Date() })
      .where(eq(memoRecipients.id, recipient.id))
      .returning();

    return updated;
  }

  //find the targeted users
  async findTargetableUsers(
    institutionId: string,
    actor: { role: Role },
    query?: string,
  ) {
    const actorRank = ROLE_RANK[actor.role];
    const allowedRoles = Object.values(Role).filter(
      (role) => role !== Role.SUPER_ADMIN && ROLE_RANK[role] <= actorRank,
    );

    const conditions = [
      eq(users.institutionId, institutionId),
      eq(users.isActive, true),
      inArray(users.role, allowedRoles),
    ];

    if (query?.trim()) {
      const search = `%${query.trim()}%`;
      conditions.push(
        or(
          ilike(users.firstName, search),
          ilike(users.lastName, search),
          ilike(users.email, search),
        )!,
      );
    }

    return this.db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        departmentId: users.departmentId,
      })
      .from(users)
      .where(and(...conditions))
      .limit(50);
  }

  private async assertTargetPayloadAllowed(
    senderId: string,
    targetType: MemoTargetTypeDto,
    targetPayload?: Record<string, unknown>,
  ) {
    if (targetType !== MemoTargetTypeDto.ROLE) {
      return;
    }

    const [sender] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, senderId))
      .limit(1);

    if (!sender) {
      throw new ForbiddenException('Sender not found');
    }

    const senderRank = ROLE_RANK[sender.role as Role];
    const targetRoles = ((targetPayload?.roles as Role[]) ?? []).filter(
      Boolean,
    );

    for (const role of targetRoles) {
      if (ROLE_RANK[role] > senderRank) {
        throw new ForbiddenException(
          `Cannot target role ${role} — it is above your rank`,
        );
      }
    }
  }

  private async filterRecipientsBySenderRank(
    institutionId: string,
    senderId: string,
    recipientIds: string[],
  ): Promise<string[]> {
    if (!recipientIds.length) {
      return [];
    }

    const [sender] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, senderId))
      .limit(1);

    if (!sender) {
      throw new ForbiddenException('Sender not found');
    }

    const senderRank = ROLE_RANK[sender.role as Role];
    const rows = await this.db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(
        and(
          eq(users.institutionId, institutionId),
          inArray(users.id, recipientIds),
          eq(users.isActive, true),
        ),
      );

    return rows
      .filter((row) => ROLE_RANK[row.role as Role] <= senderRank)
      .filter((row) => row.id !== senderId)
      .map((row) => row.id);
  }

  private async resolveRecipients(
    institutionId: string,
    memo: typeof memos.$inferSelect,
    senderId: string,
  ): Promise<string[]> {
    const baseConditions = and(
      eq(users.institutionId, institutionId),
      eq(users.isActive, true),
    );

    const payload = memo.targetPayload as Record<string, unknown>;

    switch (memo.targetType as MemoTargetTypeDto) {
      case MemoTargetTypeDto.BROADCAST: {
        const rows = await this.db
          .select({ id: users.id })
          .from(users)
          .where(baseConditions);
        return this.filterRecipientsBySenderRank(
          institutionId,
          senderId,
          rows.map((r) => r.id),
        );
      }

      case MemoTargetTypeDto.DEPARTMENT: {
        const departmentIds = (payload.department_ids as string[]) ?? [];
        if (!departmentIds.length) {
          throw new BadRequestException(
            'department_ids required in target_payload',
          );
        }
        const rows = await this.db
          .select({ id: users.id })
          .from(users)
          .where(
            and(baseConditions, inArray(users.departmentId, departmentIds)),
          );
        return this.filterRecipientsBySenderRank(
          institutionId,
          senderId,
          rows.map((r) => r.id),
        );
      }

      case MemoTargetTypeDto.ROLE: {
        const targetRoles =
          (payload.roles as (typeof users.$inferSelect.role)[]) ?? [];
        if (!targetRoles.length) {
          throw new BadRequestException('roles required in target_payload');
        }
        const rows = await this.db
          .select({ id: users.id })
          .from(users)
          .where(and(baseConditions, inArray(users.role, targetRoles)));
        return this.filterRecipientsBySenderRank(
          institutionId,
          senderId,
          rows.map((r) => r.id),
        );
      }

      case MemoTargetTypeDto.INDIVIDUAL: {
        const userIds = (payload.user_ids as string[]) ?? [];
        if (!userIds.length) {
          throw new BadRequestException('user_ids required in target_payload');
        }
        const rows = await this.db
          .select({ id: users.id })
          .from(users)
          .where(and(baseConditions, inArray(users.id, userIds)));
        return this.filterRecipientsBySenderRank(
          institutionId,
          senderId,
          rows.map((r) => r.id),
        );
      }

      default:
        throw new BadRequestException('Invalid target type');
    }
  }

  private async assertMemoReadable(
    memo: typeof memos.$inferSelect,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    const isSender = memo.senderId === userId;
    const permissions = ROLE_PERMISSIONS[userRole] ?? [];
    const canManage = permissions.includes(Permission.MANAGE_MEMOS);

    if (memo.status === 'draft') {
      if (!isSender) {
        throw new ForbiddenException('Only the sender can view draft memos');
      }
      return;
    }

    const [recipient] = await this.db
      .select({ id: memoRecipients.id })
      .from(memoRecipients)
      .where(
        and(
          eq(memoRecipients.memoId, memo.id),
          eq(memoRecipients.userId, userId),
        ),
      )
      .limit(1);

    const isRecipient = Boolean(recipient);

    if (!isSender && !isRecipient && !canManage) {
      throw new ForbiddenException('You do not have access to this memo');
    }

    if (isRecipient && !isSender && !canManage) {
      if (memo.expiresAt && memo.expiresAt <= new Date()) {
        throw new NotFoundException('Memo not found');
      }
    }
  }
}

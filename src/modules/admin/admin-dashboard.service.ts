import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import {
  departments,
  institutions,
  memoRecipients,
  memos,
  notifications,
  users,
} from '../../database/schema';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { MemoAttachmentsService } from '../memos/memo-attachments.service';
import { ListMemosQueryDto } from './dto/list-memos-query.dto';

type DashboardMemoStatus = 'published' | 'draft' | 'archived';

@Injectable()
export class AdminDashboardService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly memoAttachmentsService: MemoAttachmentsService,
  ) {}

  async getSummary(user: AuthenticatedUser) {
    if (!user.institutionId) {
      throw new NotFoundException('Institution context required');
    }
    const institutionId = user.institutionId;

    const [institution] = await this.db
      .select({
        id: institutions.id,
        name: institutions.name,
        schoolCode: institutions.schoolCode,
        subdomain: institutions.subdomain,
        seatQuota: institutions.seatQuota,
      })
      .from(institutions)
      .where(eq(institutions.id, institutionId))
      .limit(1);

    if (!institution) {
      throw new NotFoundException('Institution not found');
    }

    const [activeUsersResult] = await this.db
      .select({ count: count() })
      .from(users)
      .where(
        and(eq(users.institutionId, institutionId), eq(users.isActive, true)),
      );

    const [departmentsResult] = await this.db
      .select({ count: count() })
      .from(departments)
      .where(
        and(
          eq(departments.institutionId, institutionId),
          eq(departments.isActive, true),
        ),
      );

    const [sentMemosResult] = await this.db
      .select({ count: count() })
      .from(memos)
      .where(
        and(eq(memos.institutionId, institutionId), eq(memos.status, 'sent')),
      );

    const [draftMemosResult] = await this.db
      .select({ count: count() })
      .from(memos)
      .where(
        and(eq(memos.institutionId, institutionId), eq(memos.status, 'draft')),
      );

    const activeUsers = activeUsersResult?.count ?? 0;
    const departmentCount = departmentsResult?.count ?? 0;
    const sentMemos = sentMemosResult?.count ?? 0;
    const draftMemos = draftMemosResult?.count ?? 0;

    const recentMemoRows = await this.db
      .select({
        id: memos.id,
        subject: memos.subject,
        status: memos.status,
        sentAt: memos.sentAt,
        createdAt: memos.createdAt,
        departmentName: departments.name,
      })
      .from(memos)
      .leftJoin(users, eq(memos.senderId, users.id))
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(eq(memos.institutionId, institutionId))
      .orderBy(desc(memos.sentAt), desc(memos.createdAt))
      .limit(7);

    const memoIds = recentMemoRows.map((memo) => memo.id);
    const readStats = await this.getReadStats(memoIds);

    return {
      institution: {
        id: institution.id,
        name: institution.name,
        shortcode: institution.schoolCode,
        subdomain: institution.subdomain,
      },
      kpis: [
        {
          id: 'active-users',
          label: 'Active users',
          value: activeUsers.toLocaleString(),
          hint: 'Registered accounts',
        },
        {
          id: 'memos-sent',
          label: 'Memos sent',
          value: sentMemos.toLocaleString(),
          hint: 'Published memos',
        },
        {
          id: 'draft-memos',
          label: 'Draft memos',
          value: draftMemos.toLocaleString(),
          hint: 'Awaiting publish',
        },
        {
          id: 'departments',
          label: 'Departments',
          value: departmentCount.toLocaleString(),
          hint: 'Organisational units',
        },
      ],
      seatUsage: {
        active: activeUsers,
        quota: institution.seatQuota,
      },
      recentMemos: recentMemoRows.map((memo) => {
        const stats = readStats.get(memo.id);
        const totalRecipients = stats?.total ?? 0;
        const readCount = stats?.read ?? 0;
        const readRate =
          totalRecipients > 0
            ? Math.round((readCount / totalRecipients) * 100)
            : 0;

        return {
          id: memo.id,
          title: memo.subject,
          department: memo.departmentName ?? 'Institution-wide',
          sentAt: formatDashboardDate(memo.sentAt ?? memo.createdAt),
          readRate,
          status: mapMemoStatus(memo.status),
        };
      }),
    };
  }

  async getMemoDetail(user: AuthenticatedUser, memoId: string) {
    if (!user.institutionId) {
      throw new NotFoundException('Institution context required');
    }

    const [row] = await this.db
      .select({
        id: memos.id,
        subject: memos.subject,
        body: memos.body,
        bodyFormat: memos.bodyFormat,
        priority: memos.priority,
        category: memos.category,
        status: memos.status,
        targetType: memos.targetType,
        expiresAt: memos.expiresAt,
        sentAt: memos.sentAt,
        createdAt: memos.createdAt,
        senderFirstName: users.firstName,
        senderLastName: users.lastName,
        departmentName: departments.name,
      })
      .from(memos)
      .leftJoin(users, eq(memos.senderId, users.id))
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(
        and(eq(memos.id, memoId), eq(memos.institutionId, user.institutionId)),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException('Memo not found');
    }

    const readStats = await this.getReadStats([row.id]);
    const stats = readStats.get(row.id) ?? { total: 0, read: 0 };
    const readRate =
      stats.total > 0 ? Math.round((stats.read / stats.total) * 100) : 0;

    const attachmentList = await this.memoAttachmentsService.listForMemo(row.id);
    const delivery = await this.getPushDeliveryStats(row.id, stats.total);

    return {
      id: row.id,
      subject: row.subject,
      body: row.body,
      bodyFormat: row.bodyFormat,
      attachments: attachmentList,
      priority: row.priority,
      category: row.category,
      status: mapMemoStatus(row.status),
      targetType: row.targetType,
      department: row.departmentName ?? 'Institution-wide',
      senderName:
        [row.senderFirstName, row.senderLastName].filter(Boolean).join(' ') ||
        'Unknown sender',
      sentAt: formatDashboardDate(row.sentAt ?? row.createdAt),
      expiresAt: row.expiresAt ? formatDashboardDate(row.expiresAt) : null,
      recipients: {
        total: stats.total,
        read: stats.read,
        readRate,
      },
      delivery,
    };
  }

  async listMemos(user: AuthenticatedUser, query: ListMemosQueryDto) {
    if (!user.institutionId) {
      throw new NotFoundException('Institution context required');
    }
    const institutionId = user.institutionId;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const [totalResult] = await this.db
      .select({ count: count() })
      .from(memos)
      .where(eq(memos.institutionId, institutionId));

    const rows = await this.db
      .select({
        id: memos.id,
        subject: memos.subject,
        priority: memos.priority,
        category: memos.category,
        status: memos.status,
        sentAt: memos.sentAt,
        createdAt: memos.createdAt,
        departmentName: departments.name,
      })
      .from(memos)
      .leftJoin(users, eq(memos.senderId, users.id))
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(eq(memos.institutionId, institutionId))
      .orderBy(desc(memos.sentAt), desc(memos.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const memoIds = rows.map((row) => row.id);
    const readStats = await this.getReadStats(memoIds);

    return {
      items: rows.map((row) => {
        const stats = readStats.get(row.id) ?? { total: 0, read: 0 };
        const readRate =
          stats.total > 0 ? Math.round((stats.read / stats.total) * 100) : 0;

        return {
          id: row.id,
          title: row.subject,
          category: row.category,
          priority: row.priority,
          department: row.departmentName ?? 'Institution-wide',
          sentAt: formatDashboardDate(row.sentAt ?? row.createdAt),
          status: mapMemoStatus(row.status),
          recipients: stats.total,
          readRate,
        };
      }),
      total: totalResult?.count ?? 0,
      page,
      pageSize,
    };
  }

  private async getReadStats(memoIds: string[]) {
    const stats = new Map<string, { total: number; read: number }>();

    if (memoIds.length === 0) {
      return stats;
    }

    const rows = await this.db
      .select({
        memoId: memoRecipients.memoId,
        total: count(),
        read: count(memoRecipients.readAt),
      })
      .from(memoRecipients)
      .where(inArray(memoRecipients.memoId, memoIds))
      .groupBy(memoRecipients.memoId);

    for (const row of rows) {
      stats.set(row.memoId, {
        total: row.total,
        read: row.read,
      });
    }

    return stats;
  }

  private async getPushDeliveryStats(memoId: string, totalRecipients: number) {
    const rows = await this.db
      .select({
        status: notifications.status,
        errorMessage: notifications.errorMessage,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.userId, users.id))
      .where(
        and(
          eq(notifications.memoId, memoId),
          eq(notifications.channel, 'push'),
        ),
      );

    let sent = 0;
    let failed = 0;
    const failures: { name: string; error: string }[] = [];

    for (const row of rows) {
      if (row.status === 'sent') {
        sent += 1;
        continue;
      }

      if (row.status === 'failed') {
        failed += 1;
        failures.push({
          name:
            [row.firstName, row.lastName].filter(Boolean).join(' ') ||
            'Unknown user',
          error: row.errorMessage ?? 'Delivery failed',
        });
      }
    }

    const notAttempted = Math.max(0, totalRecipients - rows.length);

    return {
      push: {
        sent,
        failed,
        notAttempted,
        total: totalRecipients,
        failures: failures.slice(0, 10),
      },
    };
  }
}

function mapMemoStatus(status: string): DashboardMemoStatus {
  if (status === 'draft' || status === 'scheduled') {
    return 'draft';
  }

  if (status === 'archived') {
    return 'archived';
  }

  return 'published';
}

function formatDashboardDate(value: Date): string {
  return value.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

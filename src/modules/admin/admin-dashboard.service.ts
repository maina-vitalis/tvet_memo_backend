import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDB } from '../../database/drizzle';
import {
  departments,
  institutions,
  memoRecipients,
  memos,
  users,
} from '../../database/schema';
import { AuthenticatedUser } from '../../common/types/auth-user.type';

type DashboardMemoStatus = 'published' | 'draft' | 'scheduled';

@Injectable()
export class AdminDashboardService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

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
      .limit(10);

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
}

function mapMemoStatus(status: string): DashboardMemoStatus {
  if (status === 'draft') {
    return 'draft';
  }

  if (status === 'scheduled') {
    return 'scheduled';
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

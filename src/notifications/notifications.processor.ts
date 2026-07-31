import { Process, Processor } from '@nestjs/bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ExpoPushMessage } from 'expo-server-sdk';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/drizzle';
import {
  memoRecipients,
  notifications,
  userPushTokens,
} from '../database/schema';
import {
  CheckPushReceiptsJob,
  PushTicketRecord,
  SendMemoPushJob,
} from './dto/push-notification.jobs';
import { ExpoProvider } from './expo.provider';
import {
  CHECK_PUSH_RECEIPTS_JOB,
  NOTIFICATIONS_QUEUE,
  NotificationsService,
  SEND_MEMO_PUSH_JOB,
} from './notifications.service';

const EXPO_BATCH_SIZE = 100;

type TokenRow = {
  token: string;
  userId: string;
};

@Processor(NOTIFICATIONS_QUEUE)
@Injectable()
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly expoProvider: ExpoProvider,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Process(SEND_MEMO_PUSH_JOB)
  async handleSendMemoPush(job: Job<SendMemoPushJob>): Promise<void> {
    const { memoId, institutionId, recipientIds, subject, body, priority } =
      job.data;

    if (!recipientIds.length) {
      return;
    }

    const alreadySent = await this.db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(
        and(
          eq(notifications.memoId, memoId),
          eq(notifications.channel, 'push'),
          eq(notifications.status, 'sent'),
          inArray(notifications.userId, recipientIds),
        ),
      );

    const sentUserIds = new Set(alreadySent.map((row) => row.userId));
    const pendingRecipientIds = recipientIds.filter(
      (userId) => !sentUserIds.has(userId),
    );

    if (pendingRecipientIds.length === 0) {
      this.logger.log(
        `Push already delivered for memo ${memoId}; skipping duplicate job run`,
      );
      return;
    }

    const tokenRows = await this.db
      .select({
        token: userPushTokens.token,
        userId: userPushTokens.userId,
      })
      .from(userPushTokens)
      .where(
        and(
          inArray(userPushTokens.userId, pendingRecipientIds),
          eq(userPushTokens.isActive, true),
        ),
      );

    const validTokens = tokenRows.filter((row) =>
      this.expoProvider.isExpoPushToken(row.token),
    );

    const tokensByUser = this.groupTokensByUser(validTokens);
    const ticketRecords: PushTicketRecord[] = [];

    if (validTokens.length > 0) {
      const messages = this.buildExpoMessages(
        validTokens,
        subject,
        body,
        priority,
        memoId,
      );

      for (const chunk of this.chunk(messages, EXPO_BATCH_SIZE)) {
        const tickets =
          await this.expoProvider.client.sendPushNotificationsAsync(chunk);

        chunk.forEach((message, index) => {
          const ticket = tickets[index];
          const token = typeof message.to === 'string' ? message.to : '';
          const userId = validTokens.find((row) => row.token === token)?.userId;

          if (!userId || !token) {
            return;
          }

          if (ticket.status === 'ok') {
            ticketRecords.push({
              ticketId: ticket.id,
              token,
              userId,
              memoId,
              institutionId,
            });
            return;
          }

          this.logger.warn(
            `Expo ticket error for memo ${memoId}, user ${userId}: ${ticket.message}`,
          );
        });
      }
    }

    const deliveredUserIds = new Set(
      ticketRecords.map((record) => record.userId),
    );
    const now = new Date();

    const notificationRows = pendingRecipientIds.map((userId) => {
      const hasTokens = (tokensByUser.get(userId) ?? []).length > 0;
      const wasDelivered = deliveredUserIds.has(userId);

      return {
        institutionId,
        userId,
        memoId,
        channel: 'push' as const,
        status: wasDelivered
          ? ('sent' as const)
          : hasTokens
            ? ('failed' as const)
            : ('failed' as const),
        errorMessage: wasDelivered
          ? null
          : hasTokens
            ? 'Expo push ticket failed'
            : 'No active push tokens registered',
        sentAt: wasDelivered ? now : null,
      };
    });

    if (notificationRows.length > 0) {
      await this.db
        .insert(notifications)
        .values(notificationRows)
        .onConflictDoUpdate({
          target: [
            notifications.userId,
            notifications.memoId,
            notifications.channel,
          ],
          set: {
            status: sql`excluded.status`,
            errorMessage: sql`excluded.error_message`,
            sentAt: sql`excluded.sent_at`,
            retryCount: sql`${notifications.retryCount} + 1`,
          },
        });
    }

    if (deliveredUserIds.size > 0) {
      await this.db
        .update(memoRecipients)
        .set({ deliveredAt: now })
        .where(
          and(
            eq(memoRecipients.memoId, memoId),
            inArray(memoRecipients.userId, [...deliveredUserIds]),
          ),
        );
    }

    try {
      await this.notificationsService.scheduleReceiptCheck({
        tickets: ticketRecords,
      });
    } catch (error) {
      this.logger.error(
        `Failed to schedule push receipt check for memo ${memoId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @Process(CHECK_PUSH_RECEIPTS_JOB)
  async handleCheckPushReceipts(job: Job<CheckPushReceiptsJob>): Promise<void> {
    const { tickets } = job.data;

    if (!tickets.length) {
      return;
    }

    const ticketIds = tickets.map((ticket) => ticket.ticketId);
    const receipts =
      await this.expoProvider.client.getPushNotificationReceiptsAsync(
        ticketIds,
      );

    const failedUserIds = new Set<string>();
    const succeededUserIds = new Set<string>();

    for (const record of tickets) {
      const receipt = receipts[record.ticketId];

      if (!receipt) {
        continue;
      }

      if (receipt.status === 'ok') {
        succeededUserIds.add(record.userId);
        continue;
      }

      failedUserIds.add(record.userId);

      if (receipt.details?.error === 'DeviceNotRegistered') {
        await this.db
          .update(userPushTokens)
          .set({ isActive: false })
          .where(eq(userPushTokens.token, record.token));
      }

      this.logger.warn(
        `Push receipt error for memo ${record.memoId}, user ${record.userId}: ${receipt.message}`,
      );
    }

    if (failedUserIds.size > 0) {
      await this.db
        .update(notifications)
        .set({
          status: 'failed',
          errorMessage: 'Push delivery failed on receipt check',
        })
        .where(
          and(
            inArray(notifications.userId, [...failedUserIds]),
            eq(notifications.memoId, job.data.tickets[0]?.memoId ?? ''),
            eq(notifications.channel, 'push'),
          ),
        );
    }

    if (succeededUserIds.size > 0) {
      await this.db
        .update(notifications)
        .set({ status: 'sent', sentAt: new Date(), errorMessage: null })
        .where(
          and(
            inArray(notifications.userId, [...succeededUserIds]),
            eq(notifications.memoId, job.data.tickets[0]?.memoId ?? ''),
            eq(notifications.channel, 'push'),
          ),
        );
    }
  }

  // Compose an Expo message. channelId must match the Android channel the
  // mobile app creates (`default`); without it FCM V1 uses a silent fallback.
  private buildExpoMessages(
    tokenRows: TokenRow[],
    subject: string,
    body: string,
    _priority: SendMemoPushJob['priority'],
    memoId: string,
  ): ExpoPushMessage[] {
    return tokenRows.map((row) => ({
      to: row.token,
      title: subject,
      body: body.slice(0, 160),
      data: { memoId },
      sound: 'default' as const,
      // High priority wakes sleeping Android devices so lock-screen banners show.
      priority: 'high' as const,
      channelId: 'default',
    }));
  }

  private groupTokensByUser(tokenRows: TokenRow[]): Map<string, string[]> {
    const map = new Map<string, string[]>();

    for (const row of tokenRows) {
      const existing = map.get(row.userId) ?? [];
      existing.push(row.token);
      map.set(row.userId, existing);
    }

    return map;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }

    return chunks;
  }
}

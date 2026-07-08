import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import {
  CheckPushReceiptsJob,
  SendMemoPushJob,
} from './dto/push-notification.jobs';

export const NOTIFICATIONS_QUEUE = 'notifications';
export const SEND_MEMO_PUSH_JOB = 'send-memo-push';
export const CHECK_PUSH_RECEIPTS_JOB = 'check-push-receipts';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationsQueue: Queue,
  ) {}

  async enqueueMemoNotification(job: SendMemoPushJob): Promise<void> {
    await this.notificationsQueue.add(SEND_MEMO_PUSH_JOB, job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async scheduleReceiptCheck(
    job: CheckPushReceiptsJob,
    delayMs = 15 * 60 * 1000,
  ): Promise<void> {
    if (!job.tickets.length) {
      return;
    }

    await this.notificationsQueue.add(CHECK_PUSH_RECEIPTS_JOB, job, {
      delay: delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}

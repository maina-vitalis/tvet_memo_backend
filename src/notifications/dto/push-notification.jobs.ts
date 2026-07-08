export interface SendMemoPushJob {
  memoId: string;
  institutionId: string;
  recipientIds: string[];
  subject: string;
  body: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: string;
}

export interface PushTicketRecord {
  ticketId: string;
  token: string;
  userId: string;
  memoId: string;
  institutionId: string;
}

export interface CheckPushReceiptsJob {
  tickets: PushTicketRecord[];
}

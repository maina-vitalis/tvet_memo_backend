import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailClient } from '@azure/communication-email';

export interface InstitutionWelcomeEmailParams {
  to: string;
  institutionName: string;
  setupUrl: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly connectionString: string | null;
  private readonly senderAddress: string | null;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.connectionString =
      this.configService.get<string>('azure.communication.connectionString') ??
      null;
    this.senderAddress =
      this.configService.get<string>('azure.communication.senderAddress') ??
      null;

    this.isConfigured = Boolean(this.connectionString && this.senderAddress);
  }

  async sendInstitutionWelcomeEmail(
    params: InstitutionWelcomeEmailParams,
  ): Promise<void> {
    const subject = `Welcome to TVET MEMO — ${params.institutionName}`;
    const expiryHours = this.configService.get<number>(
      'setupToken.expiryHours',
      72,
    );
    const textBody = [
      `Welcome to TVET MEMO.`,
      ``,
      `Your secure workspace for ${params.institutionName} is ready.`,
      ``,
      `Click the link below to initialize your root administrator account:`,
      params.setupUrl,
      ``,
      `This link expires in ${expiryHours} hours.`,
      ``,
      `— The TVET MEMO Team`,
    ].join('\n');

    const htmlBody = `
      <p>Welcome to <strong>TVET MEMO</strong>.</p>
      <p>Your secure workspace for <strong>${params.institutionName}</strong> is ready.</p>
      <p><a href="${params.setupUrl}">Click here to initialize your root administrator account</a></p>
      <p>This link expires in ${expiryHours} hours.</p>
      <p>— The TVET MEMO Team</p>
    `;

    if (!this.isConfigured || !this.connectionString || !this.senderAddress) {
      this.logger.warn(
        `Azure Communication Services not configured — setup link for ${params.to}: ${params.setupUrl}`,
      );
      return;
    }

    const client = new EmailClient(this.connectionString);
    const poller = await client.beginSend({
      senderAddress: this.senderAddress,
      content: {
        subject,
        plainText: textBody,
        html: htmlBody,
      },
      recipients: {
        to: [{ address: params.to }],
      },
    });

    const result = await poller.pollUntilDone();

    if (result.status === 'Succeeded') {
      this.logger.log(
        `Welcome email sent to ${params.to} for ${params.institutionName}`,
      );
      return;
    }

    this.logger.error(
      `Failed to send welcome email to ${params.to}: ${result.error?.message ?? result.status}`,
    );
  }
}

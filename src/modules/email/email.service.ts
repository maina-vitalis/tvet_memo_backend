import { EmailClient, type EmailMessage } from '@azure/communication-email';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: EmailClient | null;
  private readonly senderAddress: string | null;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>(
      'azure.communicationConnectionString',
    );
    const senderAddress = this.configService.get<string>(
      'azure.emailSenderAddress',
    );

    if (connectionString && senderAddress) {
      this.client = new EmailClient(connectionString);
      this.senderAddress = senderAddress;
    } else {
      this.client = null;
      this.senderAddress = null;
      this.logger.warn(
        'Azure email is not configured — verification codes will be logged to the console',
      );
    }
  }

  async sendVerificationCode(
    to: string,
    code: string,
    institutionName?: string,
  ): Promise<void> {
    if (!this.client || !this.senderAddress) {
      this.logger.log(`OTP for ${to}: ${code}`);
      return;
    }

    const displayName = institutionName ?? 'TVET Memo';
    const message: EmailMessage = {
      senderAddress: this.senderAddress,
      content: {
        subject: `${displayName} — your verification code`,
        plainText: [
          `Your ${displayName} verification code is: ${code}`,
          '',
          'This code expires in 10 minutes.',
          'If you did not request this, you can ignore this email.',
        ].join('\n'),
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #1a365d; margin-bottom: 8px;">Verify your email</h2>
            <p style="color: #4a5568; margin-top: 0;">Use this code to sign in to <strong>${displayName}</strong>:</p>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a365d; margin: 24px 0;">${code}</p>
            <p style="color: #718096; font-size: 14px;">This code expires in 10 minutes.</p>
            <p style="color: #a0aec0; font-size: 12px;">If you did not request this, you can ignore this email.</p>
          </div>
        `.trim(),
      },
      recipients: {
        to: [{ address: to }],
      },
    };

    const poller = await this.client.beginSend(message);
    const result = await poller.pollUntilDone();

    if (result.status !== 'Succeeded') {
      this.logger.error(
        `Failed to send verification email to ${to}: ${result.error?.message ?? result.status}`,
      );
      throw new Error('Failed to send verification email');
    }

    this.logger.log(`Verification email sent to ${to}`);
  }
}

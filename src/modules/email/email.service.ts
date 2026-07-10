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

  /**
   * [PROVISIONING] Send login credentials to a newly provisioned trainee.
   *
   * The user logs in via the mobile app using:
   *   1. School code — to locate the institution
   *   2. Admission number — as their identifier
   *   3. Temporary password (= admission number) — must change on first login
   */
  async sendProvisioningCredentials(params: {
    to: string;
    firstName: string;
    schoolCode: string;
    tempPassword: string;
    admissionNumber: string;
    institutionName?: string;
  }): Promise<void> {
    const {
      to,
      firstName,
      schoolCode,
      tempPassword,
      admissionNumber,
      institutionName,
    } = params;
    const displayName = institutionName ?? 'TVET Memo';

    if (!this.client || !this.senderAddress) {
      this.logger.log(
        `[PROVISIONING] Credentials for ${to} — school code: ${schoolCode}, admission number: ${admissionNumber}, password: ${tempPassword}`,
      );
      return;
    }

    const message: EmailMessage = {
      senderAddress: this.senderAddress,
      content: {
        subject: `${displayName} — Your account is ready`,
        plainText: [
          `Hi ${firstName},`,
          '',
          `Your account has been created on ${displayName}.`,
          '',
          'Use the following credentials to log in on the mobile app:',
          '',
          `  School Code:            ${schoolCode}`,
          `  Admission Number:       ${admissionNumber}`,
          `  Temporary Password:     ${tempPassword}`,
          '',
          'Steps to log in:',
          '  1. Open the TVET Memo mobile app.',
          '  2. Enter the school code above to find your institution.',
          `  3. Enter your admission number: ${admissionNumber}`,
          '  4. Enter the temporary password above.',
          '  5. You will be prompted to set a new password on first login.',
          '',
          'Keep this email safe. Do not share your password with anyone.',
          'If you did not expect this email, contact your institution administrator.',
        ].join('\n'),
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff;">
            <h2 style="color: #1a365d; margin-bottom: 4px;">${displayName}</h2>
            <p style="color: #718096; font-size: 14px; margin-top: 0;">Account provisioned</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />

            <p style="color: #4a5568;">Hi <strong>${firstName}</strong>,</p>
            <p style="color: #4a5568;">Your account has been created. Use the credentials below to sign in on the mobile app.</p>

            <div style="background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #718096; font-size: 14px; width: 160px;">School Code</td>
                  <td style="padding: 8px 0; font-size: 18px; font-weight: bold; letter-spacing: 3px; color: #1a365d;">${schoolCode}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #718096; font-size: 14px;">Admission Number</td>
                  <td style="padding: 8px 0; font-size: 15px; font-weight: bold; font-family: monospace; color: #2d3748;">${admissionNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #718096; font-size: 14px;">Temporary Password</td>
                  <td style="padding: 8px 0; font-size: 16px; font-weight: bold; font-family: monospace; color: #2d3748;">${tempPassword}</td>
                </tr>
              </table>
            </div>

            <p style="color: #4a5568; font-size: 14px; font-weight: 600; margin-bottom: 8px;">Steps to log in:</p>
            <ol style="color: #4a5568; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Open the <strong>TVET Memo</strong> mobile app.</li>
              <li>Enter the school code to find your institution.</li>
              <li>Enter your <strong>admission number</strong>.</li>
              <li>Enter the temporary password above.</li>
              <li>You will be prompted to <strong>set a new password</strong> on first login.</li>
            </ol>

            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #a0aec0; font-size: 12px; margin: 0;">Keep this email safe. Do not share your password with anyone. If you did not expect this email, contact your institution administrator.</p>
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
        `Failed to send provisioning email to ${to}: ${result.error?.message ?? result.status}`,
      );
      throw new Error('Failed to send provisioning email');
    }

    this.logger.log(`Provisioning credentials email sent to ${to}`);
  }
}

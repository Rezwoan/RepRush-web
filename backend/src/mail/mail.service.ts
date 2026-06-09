import { InternalServerErrorException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

const LOGO_BASE64 =
  'data:image/png;base64,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';

type MailPayload = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
};

const emailBase = (content: string, preheader = '') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark light" />
  <meta name="supported-color-schemes" content="dark light" />
</head>
<body style="margin:0;padding:0;background:#0b0f17;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0b0f17;">${preheader}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f17;background-image:radial-gradient(900px 360px at 50% -10%, rgba(10,128,245,0.16), transparent 70%);padding:44px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:28px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    <img src="${LOGO_BASE64}" width="46" height="46" alt="RepRush"
                      style="border-radius:12px;display:block;background:#ffffff;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:27px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Rep</span><span style="font-size:27px;font-weight:800;color:#faba0c;letter-spacing:-0.5px;">Rush</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#11151e;border-radius:18px;border:1px solid #232c3a;overflow:hidden;box-shadow:0 18px 50px -24px rgba(0,0,0,0.8);">
              <!-- Blue → gold accent bar -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:5px;background:#0a80f5;background-image:linear-gradient(90deg,#0a80f5 0%,#3b97f5 48%,#faba0c 115%);font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
              <!-- Content -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:38px 38px 34px;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:26px;" align="center">
              <p style="margin:0 0 4px;font-size:13px;color:#8a97a8;font-weight:600;letter-spacing:0.2px;">
                Rep<span style="color:#faba0c;">Rush</span>
              </p>
              <p style="margin:0;font-size:12px;color:#46505f;letter-spacing:0.3px;">
                Track every rep. Own every result.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend?: Resend;

  constructor(private config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    if (apiKey && apiKey !== 're_xxxxxxxxxxxx') {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend email client configured');
    } else {
      this.logger.warn('RESEND_API_KEY not configured; emails will be logged only');
    }
  }

  private async sendEmail(payload: MailPayload, description: string) {
    if (!this.resend) return null;
    try {
      const result = await this.resend.emails.send(payload);
      if (result.error) {
        this.logger.error(`Resend failed (${description}): ${result.error.name} - ${result.error.message}`);
        throw new InternalServerErrorException(`Email delivery failed: ${result.error.message}`);
      }
      this.logger.log(`${description} sent to ${payload.to}: ${result.data?.id}`);
      return result.data;
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send ${description} to ${payload.to}: ${message}`);
      throw new InternalServerErrorException(`Email delivery failed: ${message}`);
    }
  }

  async sendInvitation(email: string, name: string, token: string, tempPassword: string) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'RepRush <onboarding@resend.dev>';
    const inviteUrl = `${frontendUrl}/login?token=${token}&email=${encodeURIComponent(email)}`;

    const content = `
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#3b97f5;">Welcome aboard ⚡</p>
      <h1 style="margin:0 0 8px;font-size:25px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">
        You're in, ${name || 'there'}.
      </h1>
      <p style="margin:0 0 28px;font-size:15px;color:#8a97a8;line-height:1.6;">
        Your RepRush account is ready. Set your password and start tracking every rep, PR, and streak.
      </p>

      <!-- Credentials box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr>
          <td style="background:#0b0f17;border:1px solid #232c3a;border-radius:12px;padding:22px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:16px;border-bottom:1px solid #1c2430;">
                  <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#5b6677;">Email</p>
                  <p style="margin:0;font-size:15px;color:#e8edf3;font-weight:500;">${email}</p>
                </td>
              </tr>
              <tr>
                <td style="padding-top:16px;">
                  <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#5b6677;">Temporary Password</p>
                  <p style="margin:0;font-size:18px;color:#faba0c;font-weight:700;font-family:'SF Mono',Consolas,monospace;letter-spacing:1.5px;">${tempPassword}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr>
          <td bgcolor="#0a80f5" style="background:#0a80f5;background-image:linear-gradient(90deg,#0a80f5,#046cc8);border-radius:12px;">
            <a href="${inviteUrl}"
               style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">
              Accept Invitation &rarr;
            </a>
          </td>
        </tr>
      </table>

      <p style="margin:0;font-size:13px;color:#5b6677;line-height:1.6;">
        Or copy this link into your browser:<br/>
        <a href="${inviteUrl}" style="color:#3b97f5;word-break:break-all;font-size:12px;">${inviteUrl}</a>
      </p>
      <p style="margin:18px 0 0;font-size:12px;color:#46505f;">Tip: change your password after your first login.</p>
    `;

    if (this.resend) {
      return this.sendEmail({ from, to: email, subject: "You're invited to RepRush ⚡", html: emailBase(content, `Your RepRush account is ready — set your password and start training.`) }, 'Invitation email');
    }
    this.logger.log(`=== INVITATION (dev) === To: ${email} | URL: ${inviteUrl} | Pass: ${tempPassword}`);
    return null;
  }

  async sendWorkoutReport(email: string, name: string, period: string, reportHtml: string) {
    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'RepRush <onboarding@resend.dev>';

    const content = `
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#3b97f5;">${period} report 📊</p>
      <h1 style="margin:0 0 8px;font-size:25px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">
        Hey ${name || 'there'}.
      </h1>
      <p style="margin:0 0 26px;font-size:15px;color:#8a97a8;line-height:1.6;">
        Here's your ${period} training summary — the numbers don't lie.
      </p>
      ${reportHtml}
      <p style="margin:24px 0 0;font-size:12px;color:#46505f;">Sent by your RepRush coach. Keep pushing. 💪</p>
    `;

    if (this.resend) {
      await this.sendEmail(
        { from, to: email, subject: `Your ${period} workout report — RepRush`, html: emailBase(content, `Your ${period} training summary is in.`) },
        'Workout report',
      );
      return;
    }
    this.logger.log(`=== WORKOUT REPORT (dev) === To: ${email} | Period: ${period}`);
  }

  async sendPasswordReset(email: string, newPassword: string) {
    const from = this.config.get<string>('RESEND_FROM_EMAIL') || 'RepRush <onboarding@resend.dev>';

    const content = `
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#3b97f5;">Account security 🔒</p>
      <h1 style="margin:0 0 8px;font-size:25px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">
        Password reset
      </h1>
      <p style="margin:0 0 28px;font-size:15px;color:#8a97a8;line-height:1.6;">
        Your RepRush password was reset by an admin. Use the temporary password below to sign in.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr>
          <td style="background:#0b0f17;border:1px solid #232c3a;border-radius:12px;padding:22px 24px;">
            <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#5b6677;">New Temporary Password</p>
            <p style="margin:0;font-size:20px;color:#faba0c;font-weight:700;font-family:'SF Mono',Consolas,monospace;letter-spacing:2px;">${newPassword}</p>
          </td>
        </tr>
      </table>

      <p style="margin:0;font-size:13px;color:#5b6677;line-height:1.6;">For your security, log in and change your password right away. If you didn't expect this, contact your admin.</p>
    `;

    if (this.resend) {
      await this.sendEmail({ from, to: email, subject: 'RepRush — Password Reset 🔒', html: emailBase(content, 'Your RepRush password has been reset.') }, 'Password reset email');
      return;
    }
    this.logger.log(`=== PASSWORD RESET (dev) === To: ${email} | New Pass: ${newPassword}`);
  }
}

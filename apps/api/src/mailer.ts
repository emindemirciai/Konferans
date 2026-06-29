import nodemailer from 'nodemailer';
import { env, smtpSecure } from './env.js';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendVerificationEmail(email: string, code: string) {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    console.warn(`[mail disabled] Verification code for ${email}: ${code}`);
    return;
  }

  const appUrl = env.PUBLIC_WEB_URL || 'https://konferans.cloud';
  const safeCode = escapeHtml(code);
  const safeUrl = escapeHtml(appUrl);

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: smtpSecure,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  await transport.sendMail({
    from: {
      name: 'Konferans',
      address: env.SMTP_FROM,
    },
    to: email,
    subject: 'Konferans hesabını doğrula',
    text: [
      'Merhaba,',
      '',
      'Konferans hesabını doğrulamak için aşağıdaki kodu kullan:',
      '',
      code,
      '',
      'Bu kod 10 dakika boyunca geçerlidir.',
      'Bu işlemi sen başlatmadıysan bu e-postayı güvenle yok sayabilirsin.',
      '',
      'Konferans',
      appUrl,
    ].join('\n'),
    html: `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Konferans hesabını doğrula</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;margin:0;padding:24px 0;">
      <tr>
        <td align="center" style="padding:0 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 12px 28px;">
                <h1 style="margin:0;font-size:24px;line-height:32px;color:#111827;">Konferans hesabını doğrula</h1>
                <p style="margin:12px 0 0 0;font-size:15px;line-height:24px;color:#4b5563;">
                  Merhaba, Konferans hesabını doğrulamak için aşağıdaki kodu kullan.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px;">
                <div style="font-size:32px;line-height:40px;letter-spacing:8px;font-weight:700;text-align:center;color:#111827;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;padding:18px 12px;">
                  ${safeCode}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 28px 28px;">
                <p style="margin:0;font-size:14px;line-height:22px;color:#4b5563;">
                  Bu kod 10 dakika boyunca geçerlidir. Bu işlemi sen başlatmadıysan bu e-postayı güvenle yok sayabilirsin.
                </p>
                <p style="margin:20px 0 0 0;font-size:14px;line-height:22px;color:#6b7280;">
                  Konferans<br />
                  <a href="${safeUrl}" style="color:#4f46e5;text-decoration:none;">${safeUrl}</a>
                </p>
              </td>
            </tr>
          </table>
          <p style="max-width:560px;margin:16px auto 0 auto;font-size:12px;line-height:18px;color:#9ca3af;text-align:center;">
            Bu e-posta, Konferans hesabı doğrulama talebi üzerine gönderilmiştir.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  });
}

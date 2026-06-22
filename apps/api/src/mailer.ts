import nodemailer from 'nodemailer';
import { env, smtpSecure } from './env.js';

export async function sendVerificationEmail(email: string, code: string) {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    console.warn(`[mail disabled] Verification code for ${email}: ${code}`);
    return;
  }

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
    from: env.SMTP_FROM,
    to: email,
    subject: "Let's Meet doğrulama kodu",
    text: `Let's Meet doğrulama kodun: ${code}. Kod 10 dakika geçerlidir.`,
  });
}

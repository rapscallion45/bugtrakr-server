import { createTransport } from "nodemailer";

async function deliver(email: string, subject: string, text: string) {
  const smtpUrl = process.env.SMTP_URL;
  const from = process.env.MAIL_FROM;
  if (!smtpUrl || !from)
    throw new Error("Email delivery is temporarily unavailable.");
  await createTransport(smtpUrl).sendMail({
    from,
    to: { name: "", address: email },
    subject,
    text,
  });
}

export function sendRecoveryCode(email: string, code: string) {
  return deliver(email, "Reset your BugTrakr password", "Your BugTrakr password reset code is " + code + ". It expires in five minutes.");
}

export function sendVerificationCode(email: string, code: string) {
  return deliver(email, "Verify your BugTrakr account", "Your BugTrakr verification code is " + code + ". It expires in 24 hours.");
}

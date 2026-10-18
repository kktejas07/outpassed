import nodemailer from "nodemailer";
import { env } from "../env";

export type Mail = { to: string; subject: string; text: string };

/** Mail sent while running tests, so tests can read reset codes. */
export const testOutbox: Mail[] = [];

let transport: nodemailer.Transporter | null = null;

/**
 * Sends email over SMTP_URL. Without it, development logs the message to the
 * console and tests keep it in `testOutbox`; production refuses to pretend.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (env.NODE_ENV === "test") {
    testOutbox.push(mail);
    return;
  }
  if (!env.SMTP_URL) {
    if (env.NODE_ENV === "production") {
      throw new Error("SMTP_URL is not configured, so email can't be sent");
    }
    console.info(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  transport ??= nodemailer.createTransport(env.SMTP_URL);
  await transport.sendMail({ from: env.MAIL_FROM, ...mail });
}

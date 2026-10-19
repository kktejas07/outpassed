import { env } from "../env";

export type Sms = { to: string; text: string; code?: string };

/** SMS sent while running tests, so tests can read codes. */
export const testSmsOutbox: Sms[] = [];

/**
 * Sends an SMS through the configured provider. MSG91 uses a DLT-approved
 * template with an `otp` variable (required for Indian numbers); Twilio sends
 * the text as is. In development the message is printed to the console.
 */
export async function sendSms(sms: Sms): Promise<void> {
  if (env.NODE_ENV === "test") {
    testSmsOutbox.push(sms);
    return;
  }
  if (env.SMS_PROVIDER === "console") {
    if (env.NODE_ENV === "production") throw new Error("SMS_PROVIDER is not configured, so SMS can't be sent");
    console.info(`[sms] to=${sms.to}: ${sms.text}`);
    return;
  }
  if (env.SMS_PROVIDER === "msg91") {
    if (!env.MSG91_AUTH_KEY || !env.MSG91_TEMPLATE_ID) throw new Error("MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required");
    const res = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: env.MSG91_AUTH_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ template_id: env.MSG91_TEMPLATE_ID, short_url: "0", recipients: [{ mobiles: sms.to.replace(/^\+/, ""), otp: sms.code ?? "" }] }),
    });
    if (!res.ok) throw new Error(`MSG91 send failed: ${res.status}`);
    return;
  }
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) throw new Error("Twilio credentials are required");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: sms.to, From: env.TWILIO_FROM, Body: sms.text }).toString(),
  });
  if (!res.ok) throw new Error(`Twilio send failed: ${res.status}`);
}

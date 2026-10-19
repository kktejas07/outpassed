import { env } from "../env";

export type WhatsAppMessage = {
  /** E.164, e.g. +919848012345. */
  to: string;
  text: string;
  /** What the message is about: OTP, VISITOR_PASS, WELCOME or a notification kind. */
  kind: string;
  /** The sign-in code, for OTP messages (Cloud API authentication templates need it separately). */
  code?: string;
  /** Cloud API alert template variables. */
  title?: string;
  body?: string;
};

type Mode = typeof env.WHATSAPP_MODE;
type Config = Pick<typeof env, "WHATSAPP_URL" | "WHATSAPP_TOKEN" | "WHATSAPP_INSTANCE" | "WHATSAPP_PHONE_NUMBER_ID" | "WHATSAPP_OTP_TEMPLATE" | "WHATSAPP_ALERT_TEMPLATE" | "WHATSAPP_TEMPLATE_LANG">;

/** Messages "sent" while testing, so tests can read them. */
export const testWhatsAppOutbox: WhatsAppMessage[] = [];

export const whatsappEnabled = () => env.WHATSAPP_MODE !== "off" || env.NODE_ENV === "test";

const digits = (phone: string) => phone.replace(/\D/g, "");
const trimSlash = (u: string) => u.replace(/\/+$/, "");

/** Builds the HTTP request for each supported server. Pure, so it's unit-tested. */
export function buildWhatsAppRequest(mode: Exclude<Mode, "off">, msg: WhatsAppMessage, c: Config): { url: string; headers: Record<string, string>; body: unknown } {
  const json = { "content-type": "application/json" };
  switch (mode) {
    case "webhook":
      if (!c.WHATSAPP_URL) throw new Error("WHATSAPP_URL is required");
      return {
        url: c.WHATSAPP_URL,
        headers: { ...json, ...(c.WHATSAPP_TOKEN ? { authorization: `Bearer ${c.WHATSAPP_TOKEN}` } : {}) },
        body: { to: msg.to, phone: digits(msg.to), text: msg.text, kind: msg.kind, ...(msg.code ? { code: msg.code } : {}) },
      };
    case "evolution":
      if (!c.WHATSAPP_URL) throw new Error("WHATSAPP_URL is required");
      return {
        url: `${trimSlash(c.WHATSAPP_URL)}/message/sendText/${encodeURIComponent(c.WHATSAPP_INSTANCE)}`,
        headers: { ...json, ...(c.WHATSAPP_TOKEN ? { apikey: c.WHATSAPP_TOKEN } : {}) },
        body: { number: digits(msg.to), text: msg.text },
      };
    case "waha":
      if (!c.WHATSAPP_URL) throw new Error("WHATSAPP_URL is required");
      return {
        url: `${trimSlash(c.WHATSAPP_URL)}/api/sendText`,
        headers: { ...json, ...(c.WHATSAPP_TOKEN ? { "x-api-key": c.WHATSAPP_TOKEN } : {}) },
        body: { session: c.WHATSAPP_INSTANCE, chatId: `${digits(msg.to)}@c.us`, text: msg.text },
      };
    case "cloud": {
      if (!c.WHATSAPP_PHONE_NUMBER_ID || !c.WHATSAPP_TOKEN) throw new Error("WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TOKEN are required");
      const base = { messaging_product: "whatsapp", to: digits(msg.to) };
      const language = { code: c.WHATSAPP_TEMPLATE_LANG };
      let body: unknown;
      if (msg.code && c.WHATSAPP_OTP_TEMPLATE) {
        // Authentication template: the code fills the body and the copy-code button.
        body = {
          ...base,
          type: "template",
          template: {
            name: c.WHATSAPP_OTP_TEMPLATE,
            language,
            components: [
              { type: "body", parameters: [{ type: "text", text: msg.code }] },
              { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: msg.code }] },
            ],
          },
        };
      } else if (!msg.code && c.WHATSAPP_ALERT_TEMPLATE) {
        body = {
          ...base,
          type: "template",
          template: {
            name: c.WHATSAPP_ALERT_TEMPLATE,
            language,
            components: [{ type: "body", parameters: [{ type: "text", text: msg.title ?? msg.kind }, { type: "text", text: msg.body ?? msg.text }] }],
          },
        };
      } else {
        // Free text only reaches people who messaged you in the last 24 hours.
        body = { ...base, type: "text", text: { body: msg.text, preview_url: true } };
      }
      return { url: `https://graph.facebook.com/v21.0/${c.WHATSAPP_PHONE_NUMBER_ID}/messages`, headers: { ...json, authorization: `Bearer ${c.WHATSAPP_TOKEN}` }, body };
    }
  }
}

/** Sends one WhatsApp message through the configured server. */
export async function sendWhatsApp(msg: WhatsAppMessage): Promise<void> {
  if (env.NODE_ENV === "test") {
    testWhatsAppOutbox.push(msg);
    return;
  }
  if (env.WHATSAPP_MODE === "off") {
    if (env.NODE_ENV === "production") throw new Error("WHATSAPP_MODE is off, so WhatsApp messages can't be sent");
    console.info(`[whatsapp] to=${msg.to} (${msg.kind}): ${msg.text}`);
    return;
  }
  const req = buildWhatsAppRequest(env.WHATSAPP_MODE, msg, env);
  const res = await fetch(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed: ${res.status} ${detail.slice(0, 200)}`);
  }
}

/** Whether a notification kind should also go to WhatsApp (WHATSAPP_ALERTS). */
export function alertGoesToWhatsApp(kind: string): boolean {
  const v = env.WHATSAPP_ALERTS.trim();
  if (v === "none" || !whatsappEnabled()) return false;
  if (v === "all") return true;
  return v.split(",").map((k) => k.trim()).includes(kind);
}

/** The app link for an alert, so the WhatsApp message can open the right screen. */
export function linkFor(data?: Record<string, string>): string | null {
  const base = `${trimSlash(env.PUBLIC_WEB_URL)}/app`;
  if (data?.outpassId) return `${base}/outpass/${data.outpassId}`;
  if (data?.visitId) return `${base}/visit/${data.visitId}`;
  if (data?.noticeId) return `${base}/notices`;
  if (data?.parcelId) return `${base}/parcels`;
  if (data?.sosId) return `${base}/sos`;
  if (data?.feeId) return `${base}/fees`;
  if (data?.eventId) return `${base}/events/${data.eventId}`;
  if (data?.itemId) return `${base}/market/${data.itemId}`;
  if (data?.occasionId) return `${base}/occasions/${data.occasionId}`;
  return null;
}

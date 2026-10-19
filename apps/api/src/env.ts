import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET must be at least 16 characters long"),
  /** Access tokens are short; the app renews them with a refresh token. */
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CORS_ORIGIN: z.string().default("*"),
  /** Signs gate QR codes. Falls back to JWT_SECRET when unset. */
  QR_SECRET: z.string().min(16).optional(),
  /**
   * Ed25519 seed (32 bytes, base64) that signs gate passes so guards can check
   * them offline. Derived from QR_SECRET when unset; set it to rotate separately.
   */
  QR_SIGNING_KEY: z.string().optional(),
  /**
   * Online fee payment through Razorpay payment links. Leave unset to accept
   * only payment proofs and office payments.
   */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  /** Campus time zone, for regular visitor hours and roll-call dates. */
  CAMPUS_TZ: z.string().default("Asia/Kolkata"),
  /** How long one rendered QR code is accepted at the gate. */
  QR_TTL_SECONDS: z.coerce.number().int().min(10).max(600).default(45),
  /**
   * Parent approval for students aged 18+:
   *   approve     — parent must still approve (default)
   *   notify_only — skip the parent step; parents only get exit/return alerts
   */
  ADULT_PARENT_MODE: z.enum(["approve", "notify_only"]).default("approve"),
  /** Base URL of the website; visitor pass links point at `${PUBLIC_WEB_URL}/app/pass/<token>`. */
  PUBLIC_WEB_URL: z.string().url().default("https://outpassed.studentalumni.ai"),
  /** Shown on the visitor's pass. */
  CAMPUS_NAME: z.string().default("Main Campus"),
  CAMPUS_ADDRESS: z.string().default(""),
  /** Phone push via Expo. Optional access token if the Expo project requires one. */
  PUSH_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** Outgoing email (password reset codes), e.g. smtps://user:pass@smtp.example.com:465 */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("Outpass <no-reply@outpassed.studentalumni.ai>"),
  /** Required to run first-time setup in production. */
  SETUP_TOKEN: z.string().min(12).optional(),
  /**
   * Demo servers only: shows the seeded demo accounts on the sign-in screen so
   * testers can sign in with one tap. Never turn this on for a real college.
   */
  DEMO_ACCOUNTS: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  DEMO_PASSWORD: z.string().default("outpass-demo-123"),
  /**
   * WhatsApp, the main channel for sign-in codes and alerts. "webhook" posts
   * { to, text, kind, code } to your own server; evolution, waha and cloud
   * speak those APIs directly; "off" prints messages in development.
   */
  WHATSAPP_MODE: z.enum(["off", "webhook", "evolution", "waha", "cloud"]).default("off"),
  /** Your server's address: the full webhook URL, or the Evolution / WAHA base URL. */
  WHATSAPP_URL: z.string().url().optional(),
  /** Sent as Bearer (webhook, cloud), apikey (evolution) or X-Api-Key (waha). */
  WHATSAPP_TOKEN: z.string().optional(),
  /** Evolution instance name or WAHA session name. */
  WHATSAPP_INSTANCE: z.string().default("default"),
  /** Meta Cloud API: phone number id and approved template names. */
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_OTP_TEMPLATE: z.string().optional(),
  /** Template with two body variables: {{1}} title, {{2}} message. Needed outside the 24-hour window. */
  WHATSAPP_ALERT_TEMPLATE: z.string().optional(),
  WHATSAPP_TEMPLATE_LANG: z.string().default("en"),
  /** Which alerts also go to WhatsApp: "all", "none", or a comma list of kinds (e.g. STUDENT_LEFT,SOS_RAISED). */
  WHATSAPP_ALERTS: z.string().default("all"),
  /** Where sign-in codes go: whatsapp (default) or sms. */
  OTP_CHANNEL: z.enum(["whatsapp", "sms"]).default("whatsapp"),
  /** SMS (fallback) for phone sign-in codes: console (development), msg91 or twilio. */
  SMS_PROVIDER: z.enum(["console", "msg91", "twilio"]).default("console"),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  /** Country code assumed for 10-digit numbers. */
  DEFAULT_COUNTRY_CODE: z.string().regex(/^\d{1,3}$/).default("91"),
  RATE_LIMIT: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = {
  ...parsed.data,
  QR_SECRET: parsed.data.QR_SECRET ?? parsed.data.JWT_SECRET,
};
export type Env = typeof env;

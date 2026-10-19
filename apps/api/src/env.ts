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
  /** SMS for phone sign-in codes: console (development), msg91 or twilio. */
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

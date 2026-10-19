import { env } from "../env";

/**
 * "+91 98480 12345", "098480 12345" and "919848012345" all become
 * "+919848012345". Returns null for anything that isn't a plausible number.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (input.trim().startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = env.DEFAULT_COUNTRY_CODE + digits;
  if (digits.length < 11 || digits.length > 15) return null;
  return `+${digits}`;
}

/** Fields to store whenever a user's phone is written. */
export function phoneFields(phone: string | null | undefined) {
  const trimmed = phone?.trim() || null;
  return { phone: trimmed, phoneNormalized: normalizePhone(trimmed) };
}

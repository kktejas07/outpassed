import { z } from "zod";

/**
 * Shared contracts between the API and the mobile app.
 * Both sides import these schemas so validation and types never drift.
 */

// --- Primitives ---

export const emailSchema = z.email().max(254);
export const passwordSchema = z.string().min(8).max(200);
export const uuidSchema = z.uuid();

// --- Auth ---

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export const loginSchema = registerSchema;

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  createdAt: z.string(),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
});

export const meResponseSchema = z.object({
  user: userSchema,
});

// --- Placeholder entity: Record ---
// Swap this whole block for the real domain entity (see spec §11).

export const recordStatusSchema = z.enum(["active", "archived"]);

export const createRecordSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  status: recordStatusSchema.default("active"),
});

export const updateRecordSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  status: recordStatusSchema.optional(),
});

export const recordSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: recordStatusSchema,
  ownerId: uuidSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const recordListSchema = z.object({
  records: z.array(recordSchema),
});

export const idParamSchema = z.object({ id: uuidSchema });

// --- Errors ---

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

// --- Inferred types ---

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UserDto = z.infer<typeof userSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type RecordStatus = z.infer<typeof recordStatusSchema>;
export type CreateRecordInput = z.infer<typeof createRecordSchema>;
export type UpdateRecordInput = z.infer<typeof updateRecordSchema>;
export type RecordDto = z.infer<typeof recordSchema>;
export type RecordList = z.infer<typeof recordListSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

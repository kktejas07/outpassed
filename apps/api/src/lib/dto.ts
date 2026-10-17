import type { Record as RecordRow, User } from "@prisma/client";
import type { RecordDto, UserDto } from "@outpassed/shared";

/**
 * Prisma rows -> API DTOs. Dates are serialised to ISO strings so the response
 * matches the shared zod schemas exactly.
 *
 * The Prisma model is named `Record`, which shadows TypeScript's built-in
 * `Record<K, V>` utility type, so it is imported under an alias (`RecordRow`).
 */

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toRecordDto(record: RecordRow): RecordDto {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    status: record.status as RecordDto["status"],
    ownerId: record.ownerId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

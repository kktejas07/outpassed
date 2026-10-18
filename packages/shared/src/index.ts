import { z } from "zod";

/**
 * Shared contracts between the API and the mobile app.
 * Both sides import these schemas so validation and types never drift.
 */

// --- Primitives ---

export const emailSchema = z.email().max(254);
export const passwordSchema = z.string().min(8).max(200);
export const uuidSchema = z.uuid();
export const isoDateSchema = z.iso.datetime({ offset: true });

export const idParamSchema = z.object({ id: uuidSchema });

// --- Roles ---

export const roleSchema = z.enum(["STUDENT", "PARENT", "WARDEN", "GUARD", "ADMIN"]);
/** Roles anyone may self-register as. Staff accounts are created by an admin. */
export const selfRegisterRoleSchema = z.enum(["STUDENT", "PARENT"]);
export const staffRoleSchema = z.enum(["WARDEN", "GUARD", "ADMIN"]);

// --- Auth ---

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(20).optional(),
  role: selfRegisterRoleSchema.default("STUDENT"),
  // Student-only profile fields.
  rollNo: z.string().trim().max(40).optional(),
  hostel: z.string().trim().max(80).optional(),
  room: z.string().trim().max(20).optional(),
  dateOfBirth: z.iso.date().optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const studentProfileSchema = z.object({
  rollNo: z.string().nullable(),
  hostel: z.string().nullable(),
  room: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
});

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  role: roleSchema,
  createdAt: z.string(),
  student: studentProfileSchema.nullable(),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
});

export const meResponseSchema = z.object({
  user: userSchema,
});

// --- Admin ---

export const createStaffSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(20).optional(),
  role: staffRoleSchema,
});

export const linkGuardianSchema = z.object({
  studentId: uuidSchema,
  parentEmail: emailSchema,
  relation: z.string().trim().min(1).max(40).default("Parent"),
  priority: z.number().int().min(1).max(3).default(1),
});

export const guardianshipSchema = z.object({
  id: uuidSchema,
  studentId: uuidSchema,
  parentId: uuidSchema,
  relation: z.string(),
  priority: z.number().int(),
});

// --- Outpass ---

export const outpassTypeSchema = z.enum(["LOCAL", "HOME", "MEDICAL", "EMERGENCY"]);

export const outpassStatusSchema = z.enum([
  "PENDING_PARENT",
  "PENDING_WARDEN",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "OUT",
  "RETURNED",
]);

export const decisionSchema = z.enum(["APPROVE", "REJECT"]);

export const createOutpassSchema = z
  .object({
    type: outpassTypeSchema,
    destination: z.string().trim().min(1).max(160),
    reason: z.string().trim().min(1).max(500),
    leaveAt: isoDateSchema,
    returnBy: isoDateSchema,
  })
  .refine((v) => new Date(v.returnBy) > new Date(v.leaveAt), {
    message: "returnBy must be after leaveAt",
    path: ["returnBy"],
  });

export const outpassDecisionSchema = z.object({
  decision: decisionSchema,
  reason: z.string().trim().max(300).optional(),
});

export const approvalSchema = z.object({
  id: uuidSchema,
  step: z.enum(["PARENT", "WARDEN"]),
  decision: decisionSchema,
  approverId: uuidSchema,
  approverName: z.string(),
  override: z.boolean(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

export const outpassSchema = z.object({
  id: uuidSchema,
  type: outpassTypeSchema,
  destination: z.string(),
  reason: z.string(),
  leaveAt: z.string(),
  returnBy: z.string(),
  status: outpassStatusSchema,
  overdue: z.boolean(),
  exitedAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  createdAt: z.string(),
  student: z.object({
    id: uuidSchema,
    name: z.string(),
    rollNo: z.string().nullable(),
    hostel: z.string().nullable(),
    room: z.string().nullable(),
  }),
  approvals: z.array(approvalSchema),
  /** The latest request to come back later, if any. */
  extension: z
    .object({
      id: uuidSchema,
      previousReturnBy: z.string(),
      requestedReturnBy: z.string(),
      reason: z.string(),
      status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
      decidedByName: z.string().nullable(),
      createdAt: z.string(),
    })
    .nullable(),
});

export const extensionRequestSchema = z.object({
  requestedReturnBy: isoDateSchema,
  reason: z.string().trim().min(3).max(300),
});

export const extensionDecisionSchema = z.object({ decision: decisionSchema });

export const outpassListQuerySchema = z.object({
  status: outpassStatusSchema.optional(),
  /** "actionable" = waiting on the caller's decision. */
  scope: z.enum(["all", "actionable"]).default("all"),
});

export const outpassListSchema = z.object({ outpasses: z.array(outpassSchema) });

export const qrTokenResponseSchema = z.object({
  token: z.string(),
  /** Seconds until this token stops being accepted at the gate. */
  expiresIn: z.number().int(),
});

// --- Gate ---

export const gateDirectionSchema = z.enum(["EXIT", "ENTRY"]);

export const gateScanSchema = z.object({
  token: z.string().min(10).max(2000),
});

export const gateVerdictSchema = z.object({
  allowed: z.boolean(),
  /** Machine-readable reason, e.g. VALID, EXPIRED, NOT_YET_VALID, BAD_SIGNATURE. */
  code: z.string(),
  message: z.string(),
  direction: gateDirectionSchema.nullable(),
  kind: z.enum(["OUTPASS", "VISIT"]).nullable(),
  subjectId: uuidSchema.nullable(),
  person: z
    .object({
      name: z.string(),
      detail: z.string(),
    })
    .nullable(),
});

export const gateEventInputSchema = z
  .object({
    /** Client-generated id so retries from the offline queue are idempotent. */
    eventId: uuidSchema,
    outpassId: uuidSchema.optional(),
    visitId: uuidSchema.optional(),
    direction: gateDirectionSchema,
    gate: z.string().trim().min(1).max(60).default("Main Gate"),
    method: z.enum(["QR", "MANUAL"]).default("QR"),
    photoMatched: z.boolean().default(true),
    note: z.string().trim().max(300).optional(),
    deviceTime: isoDateSchema.optional(),
  })
  .refine((v) => Boolean(v.outpassId) !== Boolean(v.visitId), {
    message: "Provide exactly one of outpassId or visitId",
    path: ["outpassId"],
  });

export const gateEventSchema = z.object({
  id: uuidSchema,
  direction: gateDirectionSchema,
  gate: z.string(),
  method: z.enum(["QR", "MANUAL"]),
  accepted: z.boolean(),
  personName: z.string(),
  outpassId: uuidSchema.nullable(),
  visitId: uuidSchema.nullable(),
  guardId: uuidSchema,
  note: z.string().nullable(),
  createdAt: z.string(),
});

export const gateEventListSchema = z.object({ events: z.array(gateEventSchema) });

// --- Visits ---

export const visitStatusSchema = z.enum([
  "PENDING_HOST",
  "APPROVED",
  "REJECTED",
  "CHECKED_IN",
  "CHECKED_OUT",
]);

export const visitorTypeSchema = z.enum([
  "GUEST",
  "PARENT",
  "RECRUITER",
  "VENDOR",
  "EVENT",
  "ALUMNI",
  "DELIVERY",
]);

export const createVisitSchema = z
  .object({
    visitorName: z.string().trim().min(1).max(120),
    visitorPhone: z.string().trim().min(5).max(20),
    visitorType: visitorTypeSchema.default("GUEST"),
    purpose: z.string().trim().min(1).max(200),
    validFrom: isoDateSchema,
    validTo: isoDateSchema,
  })
  .refine((v) => new Date(v.validTo) > new Date(v.validFrom), {
    message: "validTo must be after validFrom",
    path: ["validTo"],
  });

export const walkInSchema = z.object({
  visitorName: z.string().trim().min(1).max(120),
  visitorPhone: z.string().trim().min(5).max(20),
  visitorType: visitorTypeSchema.default("GUEST"),
  purpose: z.string().trim().min(1).max(200),
  hostId: uuidSchema,
  /** How long the visit may last once approved, in minutes. */
  durationMinutes: z.number().int().min(15).max(720).default(180),
});

export const visitDecisionSchema = z.object({ decision: decisionSchema });

export const visitSchema = z.object({
  id: uuidSchema,
  visitorName: z.string(),
  visitorPhone: z.string(),
  visitorType: visitorTypeSchema,
  purpose: z.string(),
  status: visitStatusSchema,
  walkIn: z.boolean(),
  validFrom: z.string(),
  validTo: z.string(),
  host: z.object({ id: uuidSchema, name: z.string() }),
  checkedInAt: z.string().nullable(),
  checkedOutAt: z.string().nullable(),
  /** 6-digit code the visitor can read out at the gate instead of showing the QR. */
  code: z.string(),
  /** Public link to the visitor's pass (QR + code), for sharing over WhatsApp/SMS. */
  passUrl: z.string(),
  createdAt: z.string(),
});

/** What the visitor sees on the public pass page. No contact details of the host. */
export const publicVisitPassSchema = z.object({
  visitorName: z.string(),
  hostName: z.string(),
  purpose: z.string(),
  status: visitStatusSchema,
  validFrom: z.string(),
  validTo: z.string(),
  code: z.string(),
  /** Signed QR token; null once the visit is over or was declined. */
  qrToken: z.string().nullable(),
  campus: z.object({ name: z.string(), address: z.string() }),
});

export const visitListSchema = z.object({ visits: z.array(visitSchema) });

export const hostListSchema = z.object({
  hosts: z.array(z.object({ id: uuidSchema, name: z.string(), role: roleSchema })),
});

// --- Dashboard ---

export const dashboardSummarySchema = z.object({
  outNow: z.number().int(),
  overdue: z.number().int(),
  pendingApprovals: z.number().int(),
  visitorsOnSite: z.number().int(),
  movementsToday: z.number().int(),
  openSos: z.number().int(),
  parcelsWaiting: z.number().int(),
  extensionRequests: z.number().int(),
  overdueList: z.array(outpassSchema),
});

// --- Parcels ---

export const parcelStatusSchema = z.enum(["AT_GATE", "COLLECTED", "RETURNED"]);

export const logParcelSchema = z.object({
  rollNo: z.string().trim().min(1).max(40),
  carrier: z.string().trim().min(1).max(60),
  note: z.string().trim().max(200).optional(),
});

export const collectParcelSchema = z.object({ code: z.string().regex(/^\d{4}$/, "Enter the 4-digit code") });

export const parcelSchema = z.object({
  id: uuidSchema,
  carrier: z.string(),
  note: z.string().nullable(),
  status: parcelStatusSchema,
  /** Only the student sees the code; staff get null. */
  code: z.string().nullable(),
  student: z.object({ id: uuidSchema, name: z.string(), rollNo: z.string().nullable(), hostel: z.string().nullable(), room: z.string().nullable() }),
  loggedByName: z.string(),
  collectedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const parcelListSchema = z.object({ parcels: z.array(parcelSchema) });

// --- SOS ---

export const sosKindSchema = z.enum(["MEDICAL", "SAFETY", "OTHER"]);
export const sosStatusSchema = z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]);

export const raiseSosSchema = z.object({
  kind: sosKindSchema,
  note: z.string().trim().max(300).optional(),
});

export const resolveSosSchema = z.object({ resolution: z.string().trim().max(300).optional() });

export const sosSchema = z.object({
  id: uuidSchema,
  kind: sosKindSchema,
  note: z.string().nullable(),
  status: sosStatusSchema,
  raisedBy: z.object({ id: uuidSchema, name: z.string(), phone: z.string().nullable(), rollNo: z.string().nullable(), hostel: z.string().nullable(), room: z.string().nullable() }),
  acknowledgedByName: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  resolvedByName: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolution: z.string().nullable(),
  createdAt: z.string(),
});

export const sosListSchema = z.object({ alerts: z.array(sosSchema) });

// --- Notices ---

export const noticeAudienceSchema = z.enum(["STUDENTS", "PARENTS", "EVERYONE"]);

export const createNoticeSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(1).max(4000),
  audience: noticeAudienceSchema.default("STUDENTS"),
  pinned: z.boolean().default(false),
});

export const noticeSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  body: z.string(),
  audience: noticeAudienceSchema,
  pinned: z.boolean(),
  authorName: z.string(),
  read: z.boolean(),
  /** Staff only: how many people it went to and how many have opened it. */
  receipts: z.object({ read: z.number().int(), total: z.number().int() }).nullable(),
  createdAt: z.string(),
});

export const noticeListSchema = z.object({ notices: z.array(noticeSchema), unread: z.number().int() });

// --- Notifications ---

export const notificationSchema = z.object({
  id: uuidSchema,
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.string()).nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const notificationListSchema = z.object({
  notifications: z.array(notificationSchema),
  unread: z.number().int(),
});

export const markReadSchema = z.object({
  /** Omit to mark everything read. */
  ids: z.array(uuidSchema).max(200).optional(),
});

export const registerDeviceSchema = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(["ios", "android", "web"]),
});

// --- Password reset ---

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  password: passwordSchema,
});

// --- Errors ---

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

// --- Inferred types ---

export type Role = z.infer<typeof roleSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UserDto = z.infer<typeof userSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type LinkGuardianInput = z.input<typeof linkGuardianSchema>;
export type GuardianshipDto = z.infer<typeof guardianshipSchema>;
export type OutpassType = z.infer<typeof outpassTypeSchema>;
export type OutpassStatus = z.infer<typeof outpassStatusSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type CreateOutpassInput = z.infer<typeof createOutpassSchema>;
export type OutpassDecisionInput = z.infer<typeof outpassDecisionSchema>;
export type ApprovalDto = z.infer<typeof approvalSchema>;
export type OutpassDto = z.infer<typeof outpassSchema>;
export type OutpassList = z.infer<typeof outpassListSchema>;
export type QrTokenResponse = z.infer<typeof qrTokenResponseSchema>;
export type GateDirection = z.infer<typeof gateDirectionSchema>;
export type GateScanInput = z.infer<typeof gateScanSchema>;
export type GateVerdict = z.infer<typeof gateVerdictSchema>;
export type GateEventInput = z.input<typeof gateEventInputSchema>;
export type GateEventDto = z.infer<typeof gateEventSchema>;
export type GateEventList = z.infer<typeof gateEventListSchema>;
export type VisitStatus = z.infer<typeof visitStatusSchema>;
export type VisitorType = z.infer<typeof visitorTypeSchema>;
export type CreateVisitInput = z.input<typeof createVisitSchema>;
export type WalkInInput = z.input<typeof walkInSchema>;
export type VisitDto = z.infer<typeof visitSchema>;
export type VisitList = z.infer<typeof visitListSchema>;
export type HostList = z.infer<typeof hostListSchema>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type PublicVisitPass = z.infer<typeof publicVisitPassSchema>;
export type ExtensionRequestInput = z.infer<typeof extensionRequestSchema>;
export type ParcelDto = z.infer<typeof parcelSchema>;
export type ParcelList = z.infer<typeof parcelListSchema>;
export type LogParcelInput = z.infer<typeof logParcelSchema>;
export type SosKind = z.infer<typeof sosKindSchema>;
export type SosDto = z.infer<typeof sosSchema>;
export type SosList = z.infer<typeof sosListSchema>;
export type NoticeAudience = z.infer<typeof noticeAudienceSchema>;
export type CreateNoticeInput = z.input<typeof createNoticeSchema>;
export type NoticeDto = z.infer<typeof noticeSchema>;
export type NoticeList = z.infer<typeof noticeListSchema>;
export type NotificationDto = z.infer<typeof notificationSchema>;
export type NotificationList = z.infer<typeof notificationListSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

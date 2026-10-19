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

export const roleSchema = z.enum(["STUDENT", "PARENT", "WARDEN", "GUARD", "ADMIN", "FACULTY"]);
/** Roles anyone may self-register as. Staff accounts are created by an admin. */
export const selfRegisterRoleSchema = z.enum(["STUDENT", "PARENT"]);
export const staffRoleSchema = z.enum(["WARDEN", "GUARD", "ADMIN", "FACULTY"]);

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
  /** Pick from GET /hostels; takes precedence over the free-text `hostel`. */
  hostelId: uuidSchema.optional(),
  /** Pick from GET /departments. */
  departmentId: uuidSchema.optional(),
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
  hostelId: z.string().nullable(),
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
  /** Signed link to the profile photo (prefix with the API address), or null. */
  photoUrl: z.string().nullable(),
  /** Faculty and students: their department. */
  department: z.object({ id: uuidSchema, name: z.string(), isHod: z.boolean() }).nullable().default(null),
  /** Shown "Offers & opportunities" (adults on a college campus with offers on). */
  showOffers: z.boolean().default(false),
});

export const authResponseSchema = z.object({
  /** Short-lived (about 15 minutes). */
  accessToken: z.string(),
  /** Long-lived; swap at POST /auth/refresh for a new pair. Works once. */
  refreshToken: z.string(),
  user: userSchema,
});

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });

export const otpRequestSchema = z.object({ phone: z.string().trim().min(8).max(20) });
export const otpVerifySchema = z.object({
  phone: z.string().trim().min(8).max(20),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const setupStatusSchema = z.object({
  needsSetup: z.boolean(),
  /** True when the server requires a setup key to continue. */
  tokenRequired: z.boolean(),
  institution: z.object({ name: z.string(), address: z.string() }).nullable(),
});

export const setupSchema = z.object({
  setupToken: z.string().max(200).optional(),
  institutionName: z.string().trim().min(2).max(120),
  address: z.string().trim().max(300).default(""),
  adminName: z.string().trim().min(1).max(120),
  adminEmail: emailSchema,
  password: passwordSchema,
  hostels: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
});

export const photoUploadSchema = z.object({
  /** Base64 JPEG or PNG, with or without a data: prefix. */
  image: z.string().min(100).max(700_000),
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
  /** Faculty: their department. */
  departmentId: uuidSchema.optional(),
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

/**
 * Why a student is going out. MEDICAL covers fever, sickness and hospital
 * visits; HOME covers family trips and vacations. EMERGENCY skips the faculty
 * and parent steps and goes straight to the warden.
 */
export const outpassTypeSchema = z.enum(["LOCAL", "HOME", "MEDICAL", "EMERGENCY", "ACADEMIC", "PERSONAL"]);

export const outpassStatusSchema = z.enum([
  "PENDING_FACULTY",
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
    /** The faculty member or HOD who gave permission; they approve first. */
    facultyId: uuidSchema.optional(),
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
  step: z.enum(["FACULTY", "PARENT", "WARDEN"]),
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
    photoUrl: z.string().nullable(),
    department: z.string().nullable().default(null),
  }),
  /** Who gave permission (approves first). */
  faculty: z.object({ id: uuidSchema, name: z.string() }).nullable().default(null),
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
  /**
   * A longer-lived copy for the app to keep and show when the phone has no
   * internet. Valid until the end of the pass window (at most a day).
   */
  offlineToken: z.string().nullable().default(null),
  offlineExpiresAt: z.string().nullable().default(null),
});

/** The key guards' phones use to check passes without internet. */
export const gateKeySchema = z.object({ alg: z.literal("Ed25519"), kid: z.string(), publicKey: z.string() });
export type GateKey = z.infer<typeof gateKeySchema>;

// --- Gate ---

export const gateDirectionSchema = z.enum(["EXIT", "ENTRY"]);

export const gateScanSchema = z.object({
  token: z.string().min(10).max(2000),
});

export const gateVerdictSchema = z.object({
  allowed: z.boolean(),
  /** True when the guard's phone decided without reaching the server. */
  offline: z.boolean().optional(),
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
      /** Photo to compare at the gate; null when none is on file. */
      photoUrl: z.string().nullable().default(null),
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
  /** Signed link to the picture taken at the gate, if any. */
  photoUrl: z.string().nullable().default(null),
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

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, e.g. 10:00");

/** A regular pass: works on these weekdays (0 = Sunday), between these hours, until validTo. */
export const repeatRuleSchema = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    from: hhmm,
    to: hhmm,
  })
  .refine((r) => r.from < r.to, { message: "End time must be after start time", path: ["to"] });

export const createVisitSchema = z
  .object({
    visitorName: z.string().trim().min(1).max(120),
    visitorPhone: z.string().trim().min(5).max(20),
    visitorType: visitorTypeSchema.default("GUEST"),
    purpose: z.string().trim().min(1).max(200),
    validFrom: isoDateSchema,
    validTo: isoDateSchema,
    /** Makes this a regular pass, e.g. a parent who visits every Sunday. */
    repeat: repeatRuleSchema.optional(),
  })
  .refine((v) => new Date(v.validTo) > new Date(v.validFrom), {
    message: "validTo must be after validFrom",
    path: ["validTo"],
  })
  .refine((v) => new Date(v.validTo).getTime() - new Date(v.validFrom).getTime() <= (v.repeat ? 184 : 14) * 86_400_000, {
    message: "A visit can last at most 14 days; a regular pass at most 6 months",
    path: ["validTo"],
  });

export const walkInSchema = z.object({
  visitorName: z.string().trim().min(1).max(120),
  visitorPhone: z.string().trim().min(5).max(20),
  visitorType: visitorTypeSchema.default("GUEST"),
  purpose: z.string().trim().min(1).max(200),
  hostId: uuidSchema,
  /** Optional roll number or ID card number (e.g. a student from another college). */
  visitorIdNumber: z.string().trim().max(40).optional(),
  /** Photo the guard took at the gate (base64 JPEG). */
  photo: z.string().min(100).max(700_000).optional(),
  /** How long the visit may last once approved, in minutes. */
  durationMinutes: z.number().int().min(15).max(720).default(180),
});

export const visitDecisionSchema = z.object({ decision: decisionSchema });

export const visitSchema = z.object({
  id: uuidSchema,
  visitorName: z.string(),
  visitorPhone: z.string(),
  visitorIdNumber: z.string().nullable().default(null),
  /** Photo the guard took at the gate (walk-ins). */
  visitorPhotoUrl: z.string().nullable().default(null),
  visitorType: visitorTypeSchema,
  purpose: z.string(),
  status: visitStatusSchema,
  walkIn: z.boolean(),
  validFrom: z.string(),
  validTo: z.string(),
  host: z.object({ id: uuidSchema, name: z.string(), role: roleSchema.optional() }),
  checkedInAt: z.string().nullable(),
  checkedOutAt: z.string().nullable(),
  /** 6-digit code the visitor can read out at the gate instead of showing the QR. */
  code: z.string(),
  /** Public link to the visitor's pass (QR + code), for sharing over WhatsApp/SMS. */
  passUrl: z.string(),
  /** Set for a regular pass. */
  repeat: z.object({ days: z.array(z.number().int()), from: z.string(), to: z.string() }).nullable(),
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
  repeat: z.object({ days: z.array(z.number().int()), from: z.string(), to: z.string() }).nullable().default(null),
  campus: z.object({ name: z.string(), address: z.string() }),
});

export const visitListSchema = z.object({ visits: z.array(visitSchema) });

export const hostListSchema = z.object({
  hosts: z.array(z.object({ id: uuidSchema, name: z.string(), role: roleSchema, detail: z.string().nullable().default(null) })),
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
  student: z.object({ id: uuidSchema, name: z.string(), rollNo: z.string().nullable(), hostel: z.string().nullable(), room: z.string().nullable(), photoUrl: z.string().nullable() }),
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
  raisedBy: z.object({ id: uuidSchema, name: z.string(), phone: z.string().nullable(), rollNo: z.string().nullable(), hostel: z.string().nullable(), room: z.string().nullable(), photoUrl: z.string().nullable() }),
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
  /** Limit to one hostel; omit for every hostel the author covers. */
  hostelId: uuidSchema.optional(),
});

export const noticeSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  body: z.string(),
  audience: noticeAudienceSchema,
  pinned: z.boolean(),
  hostelName: z.string().nullable(),
  authorName: z.string(),
  read: z.boolean(),
  /** Staff only: how many people it went to and how many have opened it. */
  receipts: z.object({ read: z.number().int(), total: z.number().int() }).nullable(),
  createdAt: z.string(),
});

export const noticeListSchema = z.object({ notices: z.array(noticeSchema), unread: z.number().int() });

// --- Hostels ---

export const hostelSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  students: z.number().int(),
  wardens: z.array(z.object({ id: uuidSchema, name: z.string() })),
});
export const hostelListSchema = z.object({ hostels: z.array(hostelSchema) });
export const hostelNameSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const assignWardenSchema = z.object({ userId: uuidSchema });

// --- Bulk import ---

export const importSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  /** Validate and preview without saving. */
  dryRun: z.boolean().default(true),
  /** Email new accounts how to set their password. */
  sendWelcome: z.boolean().default(false),
});

export const importRowSchema = z.object({
  row: z.number().int(),
  name: z.string(),
  rollNo: z.string(),
  action: z.enum(["create", "update", "error"]),
  parent: z.enum(["create", "link", "none"]),
  message: z.string().nullable(),
});

export const importResultSchema = z.object({
  dryRun: z.boolean(),
  rows: z.array(importRowSchema),
  summary: z.object({
    created: z.number().int(),
    updated: z.number().int(),
    parentsCreated: z.number().int(),
    parentsLinked: z.number().int(),
    hostelsCreated: z.number().int(),
    errors: z.number().int(),
  }),
});

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
export type SetupStatus = z.infer<typeof setupStatusSchema>;
export type SetupInput = z.input<typeof setupSchema>;
export type HostelDto = z.infer<typeof hostelSchema>;
export type HostelList = z.infer<typeof hostelListSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
export type ImportRow = z.infer<typeof importRowSchema>;
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

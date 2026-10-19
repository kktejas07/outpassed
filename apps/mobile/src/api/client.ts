import type {
  AuthResponse,
  CreateOutpassInput,
  CreateVisitInput,
  DashboardSummary,
  Decision,
  GateEventDto,
  GateEventInput,
  GateEventList,
  GateVerdict,
  GateKey,
  GuardianshipDto,
  HostelDto,
  HostList,
  ImportResult,
  SetupInput,
  SetupStatus,
  LinkGuardianInput,
  MeResponse,
  NotificationList,
  CreateNoticeInput,
  NoticeList,
  ParcelDto,
  ParcelList,
  SosDto,
  SosKind,
  SosList,
  PublicVisitPass,
  ResetPasswordInput,
  OutpassDto,
  OutpassList,
  OutpassStatus,
  QrTokenResponse,
  RegisterInput,
  Role,
  UserDto,
  VisitDto,
  VisitList,
  WalkInInput,
} from "@outpassed/shared";

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
};

/**
 * Access tokens last about 15 minutes. When one is rejected, the session
 * renews it with the refresh token and the request is tried once more.
 */
type Renew = (failedToken: string) => Promise<string | null>;
let renewToken: Renew | null = null;
export function setTokenRenewer(fn: Renew | null) {
  renewToken = fn;
}

/** Full address of a photo link from the API (which returns relative links). */
export function photoSrc(url: string | null | undefined): string | null {
  return url ? `${BASE_URL}${url}` : null;
}

async function send(path: string, options: RequestOptions, token: string | null | undefined): Promise<Response> {
  try {
    return await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0, "NETWORK");
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options, options.token);
  if (response.status === 401 && options.token && renewToken) {
    const fresh = await renewToken(options.token);
    if (fresh) response = await send(path, options, fresh);
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      data?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      data?.error?.code,
    );
  }
  return data as T;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return s ? `?${s}` : "";
};

/** Thin typed wrapper over the Outpass API. Every authed call takes the token first. */
export const api = {
  // Auth
  register: (input: RegisterInput) => request<AuthResponse>("/auth/register", { method: "POST", body: input }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: { email, password } }),
  me: (token: string) => request<MeResponse>("/auth/me", { token }),
  forgotPassword: (email: string) =>
    request<{ ok: true; message: string }>("/auth/forgot", { method: "POST", body: { email } }),
  resetPassword: (input: ResetPasswordInput) => request<AuthResponse>("/auth/reset", { method: "POST", body: input }),
  refresh: (refreshToken: string) => request<AuthResponse>("/auth/refresh", { method: "POST", body: { refreshToken } }),
  logout: (refreshToken: string) => request<void>("/auth/logout", { method: "POST", body: { refreshToken } }),
  otpRequest: (phone: string) => request<{ ok: true; message: string; channel?: "whatsapp" | "sms" }>("/auth/otp/request", { method: "POST", body: { phone } }),
  otpVerify: (phone: string, code: string) => request<AuthResponse>("/auth/otp/verify", { method: "POST", body: { phone, code } }),

  // First-time setup
  setupStatus: () => request<SetupStatus>("/setup"),
  setup: (input: SetupInput) => request<AuthResponse>("/setup", { method: "POST", body: input }),

  // Hostels
  hostels: () => request<{ hostels: { id: string; name: string }[] }>("/hostels").then((r) => r.hostels),
  adminHostels: (token: string) => request<{ hostels: HostelDto[] }>("/admin/hostels", { token }).then((r) => r.hostels),
  createHostel: (token: string, name: string) => request<HostelDto>("/admin/hostels", { method: "POST", token, body: { name } }),
  renameHostel: (token: string, id: string, name: string) => request<HostelDto>(`/admin/hostels/${id}`, { method: "PATCH", token, body: { name } }),
  assignWarden: (token: string, id: string, userId: string) =>
    request<HostelDto>(`/admin/hostels/${id}/wardens`, { method: "POST", token, body: { userId } }),
  unassignWarden: (token: string, id: string, userId: string) =>
    request<HostelDto>(`/admin/hostels/${id}/wardens/${userId}`, { method: "DELETE", token }),

  // Photos (base64 JPEG)
  uploadMyPhoto: (token: string, image: string) => request<{ photoUrl: string }>("/me/photo", { method: "PUT", token, body: { image } }),
  uploadUserPhoto: (token: string, userId: string, image: string) =>
    request<{ photoUrl: string }>(`/admin/users/${userId}/photo`, { method: "PUT", token, body: { image } }),

  // Bulk import
  importStudents: (token: string, csv: string, dryRun: boolean, sendWelcome = false) =>
    request<ImportResult>("/admin/import/students", { method: "POST", token, body: { csv, dryRun, sendWelcome } }),

  // Notifications
  notifications: (token: string) => request<NotificationList>("/notifications", { token }),
  markRead: (token: string, ids?: string[]) =>
    request<{ updated: number }>("/notifications/read", { method: "POST", token, body: ids ? { ids } : {} }),
  registerDevice: (token: string, pushToken: string, platform: "ios" | "android" | "web") =>
    request<void>("/devices", { method: "POST", token, body: { token: pushToken, platform } }),
  removeDevice: (token: string, pushToken: string) =>
    request<void>("/devices/remove", { method: "POST", token, body: { token: pushToken } }),

  // Public (no sign-in)
  visitPass: (passToken: string) => request<PublicVisitPass>(`/public/visit-pass/${encodeURIComponent(passToken)}`),

  // Outpasses
  listOutpasses: (token: string, opts: { scope?: "all" | "actionable"; status?: OutpassStatus } = {}) =>
    request<OutpassList>(`/outpasses${qs(opts)}`, { token }).then((r) => r.outpasses),
  createOutpass: (token: string, input: CreateOutpassInput) =>
    request<OutpassDto>("/outpasses", { method: "POST", token, body: input }),
  getOutpass: (token: string, id: string) => request<OutpassDto>(`/outpasses/${id}`, { token }),
  decideOutpass: (token: string, id: string, decision: Decision, reason?: string) =>
    request<OutpassDto>(`/outpasses/${id}/decision`, { method: "POST", token, body: { decision, reason } }),
  cancelOutpass: (token: string, id: string) =>
    request<OutpassDto>(`/outpasses/${id}/cancel`, { method: "POST", token }),
  outpassQr: (token: string, id: string) => request<QrTokenResponse>(`/outpasses/${id}/qr`, { token }),
  requestExtension: (token: string, id: string, requestedReturnBy: string, reason: string) =>
    request<OutpassDto>(`/outpasses/${id}/extend`, { method: "POST", token, body: { requestedReturnBy, reason } }),
  decideExtension: (token: string, id: string, decision: Decision) =>
    request<OutpassDto>(`/outpasses/${id}/extend/decision`, { method: "POST", token, body: { decision } }),

  // Parcels
  parcels: (token: string, scope: "waiting" | "recent" = "waiting") =>
    request<ParcelList>(`/parcels${qs({ scope })}`, { token }).then((r) => r.parcels),
  logParcel: (token: string, input: { rollNo: string; carrier: string; note?: string }) =>
    request<ParcelDto>("/parcels", { method: "POST", token, body: input }),
  collectParcel: (token: string, id: string, code: string) =>
    request<ParcelDto>(`/parcels/${id}/collect`, { method: "POST", token, body: { code } }),

  // SOS
  sosList: (token: string) => request<SosList>("/sos", { token }).then((r) => r.alerts),
  raiseSos: (token: string, kind: SosKind, note?: string) => request<SosDto>("/sos", { method: "POST", token, body: { kind, note } }),
  acknowledgeSos: (token: string, id: string) => request<SosDto>(`/sos/${id}/acknowledge`, { method: "POST", token }),
  resolveSos: (token: string, id: string, resolution?: string) =>
    request<SosDto>(`/sos/${id}/resolve`, { method: "POST", token, body: resolution ? { resolution } : {} }),

  // Notices
  notices: (token: string) => request<NoticeList>("/notices", { token }),
  postNotice: (token: string, input: CreateNoticeInput) => request<{ id: string }>("/notices", { method: "POST", token, body: input }),
  readNotice: (token: string, id: string) => request<void>(`/notices/${id}/read`, { method: "POST", token }),
  deleteNotice: (token: string, id: string) => request<void>(`/notices/${id}`, { method: "DELETE", token }),

  // Gate
  gateKey: (token: string) => request<GateKey>("/gate/key", { token }),
  scan: (token: string, qrToken: string) =>
    request<GateVerdict>("/gate/scan", { method: "POST", token, body: { token: qrToken } }),
  lookupRoll: (token: string, rollNo: string) => request<GateVerdict>(`/gate/lookup${qs({ rollNo })}`, { token }),
  lookupVisitCode: (token: string, code: string) => request<GateVerdict>(`/gate/lookup${qs({ code })}`, { token }),
  recordEvent: (token: string, input: GateEventInput) =>
    request<GateEventDto>("/gate/events", { method: "POST", token, body: input }),
  listEvents: (token: string, limit = 40) =>
    request<GateEventList>(`/gate/events${qs({ limit })}`, { token }).then((r) => r.events),

  // Visits
  hosts: (token: string, q?: string) => request<HostList>(`/visits/hosts${qs({ q })}`, { token }).then((r) => r.hosts),
  listVisits: (token: string, scope: "all" | "pending" | "onsite" = "all") =>
    request<VisitList>(`/visits${qs({ scope })}`, { token }).then((r) => r.visits),
  getVisit: (token: string, id: string) => request<VisitDto>(`/visits/${id}`, { token }),
  createVisit: (token: string, input: CreateVisitInput) =>
    request<VisitDto>("/visits", { method: "POST", token, body: input }),
  walkIn: (token: string, input: WalkInInput) =>
    request<VisitDto>("/visits/walk-in", { method: "POST", token, body: input }),
  decideVisit: (token: string, id: string, decision: Decision) =>
    request<VisitDto>(`/visits/${id}/decision`, { method: "POST", token, body: { decision } }),
  visitQr: (token: string, id: string) => request<QrTokenResponse>(`/visits/${id}/qr`, { token }),

  // Admin & dashboard
  dashboard: (token: string) => request<DashboardSummary>("/dashboard/summary", { token }),
  listUsers: (token: string, role?: Role) =>
    request<{ users: UserDto[] }>(`/admin/users${qs({ role })}`, { token }).then((r) => r.users),
  createStaff: (token: string, input: { email: string; password: string; name: string; phone?: string; role: "WARDEN" | "GUARD" | "ADMIN" | "FACULTY"; departmentId?: string }) =>
    request<{ user: UserDto }>("/admin/users", { method: "POST", token, body: input }).then((r) => r.user),
  linkGuardian: (token: string, input: LinkGuardianInput) =>
    request<GuardianshipDto>("/admin/guardianships", { method: "POST", token, body: input }),
};

export type RollMark = "PRESENT" | "ABSENT" | "ON_PASS";
export type RollSheet = {
  hostel: { id: string; name: string };
  hostels: { id: string; name: string }[];
  date: string;
  rollCall: { id: string; startedAt: string; closedAt: string | null; takenByName: string } | null;
  students: {
    id: string;
    name: string;
    rollNo: string | null;
    room: string | null;
    photoUrl: string | null;
    status: RollMark | null;
    pass: { outpassId: string; destination: string; returnBy: string; overdue: boolean } | null;
  }[];
  counts: { total: number; present: number; absent: number; onPass: number; unmarked: number };
};
export type ReportSummary = {
  from: string;
  to: string;
  outpasses: { requested: number; approved: number; rejected: number };
  movements: { exits: number; returns: number };
  lateReturns: number;
  overdueNow: number;
  visitors: number;
  parcels: number;
  sos: number;
  rollCallAbsences: number;
  repeatLate: { id: string; name: string; rollNo: string | null; count: number }[];
};
export type ReportType = "movements" | "late" | "visitors" | "absences";
export type AuditEntry = { id: string; actorName: string; actorRole: string; action: string; summary: string; targetType: string | null; targetId: string | null; createdAt: string };

// --- Campus life: faculty, fees, events, marketplace, offers, settings ---

export type FacultyOption = { id: string; name: string; department: string | null; isHod: boolean; mine: boolean };
export type Department = { id: string; name: string; code: string | null; hod: { id: string; name: string } | null; faculty: number; students: number };
export type FeePaymentDto = {
  id: string;
  method: "ONLINE" | "PROOF" | "OFFICE";
  status: "PENDING" | "VERIFIED" | "REJECTED";
  amountPaise: number;
  reference: string | null;
  note: string | null;
  createdAt: string;
  proofUrl: string | null;
  /** Set once the payment is accepted. */
  receiptNo: number | null;
  /** Signed link to the PDF receipt (prefix with the API address). */
  receiptUrl: string | null;
};
export type FeeDto = {
  id: string;
  category: "HOSTEL" | "MESS" | "BUS" | "TUITION" | "EXAM" | "FINE" | "OTHER";
  title: string;
  amountPaise: number;
  /** Accepted so far; less than amountPaise after a part-payment. */
  paidPaise: number;
  remainingPaise: number;
  /** The office lets this fee be paid in parts. */
  allowParts: boolean;
  dueDate: string;
  status: "DUE" | "SUBMITTED" | "PAID" | "WAIVED";
  overdue: boolean;
  note: string | null;
  paidAt: string | null;
  student: { id: string; name: string; rollNo: string | null; hostel: string | null };
  payments: FeePaymentDto[];
};
export type EventDto = {
  id: string;
  title: string;
  description: string;
  venue: string;
  category: string;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  registered: boolean;
  registrations: number;
  seatsLeft: number | null;
  registrationOpen: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  rejectReason: string | null;
  organizer: { id: string; name: string };
};
export type MarketItemDto = {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  status: "PENDING" | "ACTIVE" | "SOLD" | "REJECTED" | "REMOVED";
  photoUrl: string | null;
  seller: { id: string; name: string; hostel: string | null };
  mine: boolean;
  interested: boolean;
  interests: number | null;
  contactUrl: string | null;
  occasion: { id: string; name: string; theme: string } | null;
  createdAt: string;
};
export type OfferDto = {
  id: string;
  category: string;
  partnerName: string;
  title: string;
  body: string;
  url: string | null;
  couponCode: string | null;
  activeTo: string | null;
  showAsBanner?: boolean;
  occasionId?: string | null;
};
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type TicketDto = {
  id: string;
  number: number;
  category: string;
  title: string;
  details: string;
  location: string | null;
  status: TicketStatus;
  photoUrl: string | null;
  student: { id: string; name: string; rollNo: string | null; room: string | null };
  hostel: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
  updates: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};
export type TicketDetail = TicketDto & {
  canReopen: boolean;
  history: { id: string; body: string; status: TicketStatus | null; at: string; author: { id: string; name: string; role: string } }[];
};
export type OfferReport = {
  month: string;
  daysInMonth: number;
  total: number;
  offers: { id: string; title: string; partnerName: string; category: string; active: boolean; taps: number; days: Record<string, number> }[];
};
export type OccasionDto = { id: string; name: string; tagline: string; theme: string; icon: string; startsAt: string; endsAt: string; active: boolean; live: boolean };
export type BannerDto = {
  id: string;
  kind: "OCCASION" | "OFFER";
  title: string;
  subtitle: string;
  theme: string;
  icon: string;
  cta: string;
  occasionId: string | null;
  offerId: string | null;
  endsAt: string | null;
  sponsor: string | null;
};
export type OccasionInput = { name: string; tagline: string; theme: string; icon: string; startsAt: string; endsAt: string };
export type CampusSettings = { offersEnabled: boolean; schoolMode: boolean; requireGatePhoto: boolean; photoRetentionDays: number; institutionName: string };
export type ConsentRow = { student: { id: string; name: string }; state: "NOT_NEEDED" | "GIVEN" | "NEEDED"; givenAt: string | null; givenBy: string | null };

export const campus = {
  settings: (token: string) => request<CampusSettings>("/settings", { token }),
  updateSettings: (token: string, input: Partial<Omit<CampusSettings, "institutionName">>) => request<CampusSettings>("/admin/settings", { method: "PATCH", token, body: input }),

  faculty: (token: string, q?: string) => request<{ faculty: FacultyOption[] }>(`/faculty${qs({ q })}`, { token }).then((r) => r.faculty),
  departments: (token: string) => request<{ departments: Department[] }>("/departments", { token }).then((r) => r.departments),
  createDepartment: (token: string, name: string, code?: string) => request<Department>("/admin/departments", { method: "POST", token, body: { name, code } }),
  setHod: (token: string, id: string, hodId: string | null) => request<Department>(`/admin/departments/${id}`, { method: "PATCH", token, body: { hodId } }),

  fees: (token: string) => request<{ fees: FeeDto[]; totals: { duePaise: number; overdue: number; open: number }; onlinePayment: boolean }>("/fees", { token }),
  payOnline: (token: string, id: string, amountPaise?: number) => request<{ url: string }>(`/fees/${id}/pay`, { method: "POST", token, body: amountPaise ? { amountPaise } : {} }),
  checkPayment: (token: string, id: string) => request<FeeDto>(`/fees/${id}/check`, { method: "POST", token }),
  uploadProof: (token: string, id: string, image: string, reference: string, amountPaise?: number) =>
    request<FeeDto>(`/fees/${id}/proof`, { method: "POST", token, body: { image, reference, ...(amountPaise ? { amountPaise } : {}) } }),
  adminFees: (token: string, status?: string, q?: string) =>
    request<{ fees: FeeDto[]; summary: { outstandingPaise: number; outstanding: number; collectedPaise: number; paid: number; proofsToReview: number } }>(`/admin/fees${qs({ status, q })}`, { token }),
  setResidence: (token: string, userId: string, residence: "HOSTELLER" | "DAY_SCHOLAR") =>
    request<UserDto>(`/admin/users/${userId}/residence`, { method: "PUT", token, body: { residence } }),
  assignFee: (token: string, input: { category: FeeDto["category"]; title: string; amountPaise: number; dueDate: string; note?: string; allowParts?: boolean; target: { hostelId?: string; departmentId?: string; allStudents?: boolean; studentIds?: string[]; residence?: "HOSTELLER" | "DAY_SCHOLAR" } }) =>
    request<{ created: number }>("/admin/fees", { method: "POST", token, body: input }),
  reviewProof: (token: string, paymentId: string, decision: "APPROVE" | "REJECT", note?: string) =>
    request<FeeDto>(`/admin/fee-payments/${paymentId}/review`, { method: "POST", token, body: { decision, note } }),
  markPaid: (token: string, id: string, reference?: string) => request<FeeDto>(`/admin/fees/${id}/mark-paid`, { method: "POST", token, body: { reference } }),

  events: (token: string, scope: "upcoming" | "mine" | "pending" | "past" = "upcoming") => request<{ events: EventDto[] }>(`/events${qs({ scope })}`, { token }).then((r) => r.events),
  event: (token: string, id: string) => request<EventDto>(`/events/${id}`, { token }),
  createEvent: (token: string, input: { title: string; description: string; venue: string; category: string; startsAt: string; endsAt: string; capacity?: number }) =>
    request<EventDto>("/events", { method: "POST", token, body: input }),
  decideEvent: (token: string, id: string, decision: "APPROVE" | "REJECT", reason?: string) => request<EventDto>(`/admin/events/${id}/decision`, { method: "POST", token, body: { decision, reason } }),
  register: (token: string, id: string) => request<EventDto>(`/events/${id}/register`, { method: "POST", token }),
  unregister: (token: string, id: string) => request<EventDto>(`/events/${id}/register`, { method: "DELETE", token }),

  market: (token: string, opts: { scope?: "browse" | "mine" | "pending"; category?: string; q?: string; occasionId?: string } = {}) =>
    request<{ items: MarketItemDto[]; categories: string[] }>(`/market${qs(opts)}`, { token }),
  marketItem: (token: string, id: string) => request<MarketItemDto>(`/market/${id}`, { token }),
  sell: (token: string, input: { title: string; description: string; price: number; category: string; condition: string; photo?: string; occasionId?: string }) =>
    request<MarketItemDto>("/market", { method: "POST", token, body: input }),
  interested: (token: string, id: string) => request<MarketItemDto>(`/market/${id}/interest`, { method: "POST", token }),
  sold: (token: string, id: string) => request<MarketItemDto>(`/market/${id}/sold`, { method: "POST", token }),
  removeItem: (token: string, id: string) => request<void>(`/market/${id}`, { method: "DELETE", token }),
  report: (token: string, id: string, reason: string) => request<{ ok: true }>(`/market/${id}/report`, { method: "POST", token, body: { reason } }),
  decideItem: (token: string, id: string, decision: "APPROVE" | "REJECT", reason?: string) => request<MarketItemDto>(`/admin/market/${id}/decision`, { method: "POST", token, body: { decision, reason } }),

  offers: (token: string) => request<{ offers: OfferDto[]; categories: string[] }>("/offers", { token }),
  openOffer: (token: string, id: string) => request<{ url: string | null }>(`/offers/${id}/open`, { method: "POST", token }),
  adminOffers: (token: string) =>
    request<{ offers: (OfferDto & { active: boolean; clicks: number; sortOrder: number })[]; categories: string[]; occasions: OccasionDto[] }>("/admin/offers", { token }),
  createOffer: (token: string, input: { category: string; partnerName: string; title: string; body: string; url?: string; couponCode?: string; sortOrder?: number; showAsBanner?: boolean; occasionId?: string | null }) =>
    request<OfferDto>("/admin/offers", { method: "POST", token, body: input }),
  setOfferActive: (token: string, id: string, active: boolean) => request<OfferDto>(`/admin/offers/${id}`, { method: "PATCH", token, body: { active } }),
  setOfferBanner: (token: string, id: string, showAsBanner: boolean) => request<OfferDto>(`/admin/offers/${id}`, { method: "PATCH", token, body: { showAsBanner } }),

  banners: (token: string) => request<{ banners: BannerDto[] }>("/banners", { token }).then((r) => r.banners),
  occasions: (token: string) => request<{ occasions: OccasionDto[] }>("/occasions", { token }).then((r) => r.occasions),
  occasion: (token: string, id: string) => request<{ occasion: OccasionDto; offers: OfferDto[]; items: MarketItemDto[]; marketAvailable: boolean }>(`/occasions/${id}`, { token }),
  adminOccasions: (token: string) => request<{ occasions: (OccasionDto & { offers: number; items: number })[]; themes: string[]; icons: string[] }>("/admin/occasions", { token }),
  createOccasion: (token: string, input: OccasionInput) => request<OccasionDto>("/admin/occasions", { method: "POST", token, body: input }),
  updateOccasion: (token: string, id: string, input: Partial<OccasionInput & { active: boolean }>) => request<OccasionDto>(`/admin/occasions/${id}`, { method: "PATCH", token, body: input }),

  consent: (token: string) => request<{ version: string; retentionDays: number; children: ConsentRow[] }>("/consent", { token }),
  giveConsent: (token: string, studentId: string) => request<{ ok: true }>(`/consent/${studentId}`, { method: "POST", token, body: { agree: true } }),
  withdrawConsent: (token: string, studentId: string) => request<{ ok: true; removed: { profile: number; gate: number } }>(`/consent/${studentId}`, { method: "DELETE", token }),

  tickets: (token: string, status: "ACTIVE" | "ALL" | TicketStatus = "ACTIVE") =>
    request<{ tickets: TicketDto[]; counts: Record<TicketStatus, number>; categories: string[] }>(`/tickets${qs({ status })}`, { token }),
  ticket: (token: string, id: string) => request<TicketDetail>(`/tickets/${id}`, { token }),
  raiseTicket: (token: string, input: { category: string; title: string; details: string; location?: string; photo?: string }) => request<TicketDto>("/tickets", { method: "POST", token, body: input }),
  updateTicket: (token: string, id: string, input: { body?: string; status?: TicketStatus }) => request<TicketDto>(`/tickets/${id}/updates`, { method: "POST", token, body: input }),
  offerReport: (token: string, month?: string) => request<OfferReport>(`/admin/offers/report${qs({ month })}`, { token }),

  gatePhoto: (token: string, eventId: string, image: string) => request<{ photoUrl: string | null; skipped?: "NO_CONSENT" }>(`/gate/events/${eventId}/photo`, { method: "PUT", token, body: { image } }),
};

/** "₹45,000" */
export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const ops = {
  rollCall: (token: string, hostelId?: string) => request<RollSheet>(`/rollcall${qs({ hostelId })}`, { token }),
  mark: (token: string, hostelId: string, studentId: string, status: "PRESENT" | "ABSENT") =>
    request<Omit<RollSheet, "hostel" | "hostels">>("/rollcall/mark", { method: "POST", token, body: { hostelId, studentId, status } }),
  markRest: (token: string, hostelId: string) => request<Omit<RollSheet, "hostel" | "hostels">>("/rollcall/mark-rest", { method: "POST", token, body: { hostelId } }),
  closeRollCall: (token: string, hostelId: string) => request<Omit<RollSheet, "hostel" | "hostels">>("/rollcall/close", { method: "POST", token, body: { hostelId } }),
  reportSummary: (token: string, from: string, to: string, hostelId?: string) => request<ReportSummary>(`/reports/summary${qs({ from, to, hostelId })}`, { token }),
  reportLink: (token: string, type: ReportType, from: string, to: string, hostelId?: string) =>
    request<{ url: string; expiresIn: number }>("/reports/link", { method: "POST", token, body: { type, from, to, hostelId } }).then((r) => `${BASE_URL}${r.url}`),
  audit: (token: string, before?: string) => request<{ entries: AuditEntry[] }>(`/admin/audit${qs({ limit: 50, before })}`, { token }).then((r) => r.entries),
};

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error ? err.message : fallback;
}

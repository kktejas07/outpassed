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
  createStaff: (token: string, input: { email: string; password: string; name: string; phone?: string; role: "WARDEN" | "GUARD" | "ADMIN" }) =>
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

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
  GuardianshipDto,
  HostList,
  LinkGuardianInput,
  MeResponse,
  NotificationList,
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
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0, "NETWORK");
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

  // Gate
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

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error ? err.message : fallback;
}

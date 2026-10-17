import type {
  AuthResponse,
  MeResponse,
  RecordDto,
  RecordList,
} from "@outpassed/shared";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

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
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

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

export const api = {
  register: (email: string, password: string) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: { email, password },
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),

  me: (token: string) => request<MeResponse>("/auth/me", { token }),

  listRecords: (token: string) =>
    request<RecordList>("/records", { token }).then((r) => r.records),

  createRecord: (
    token: string,
    input: { title: string; description?: string | null; status?: "active" | "archived" },
  ) => request<RecordDto>("/records", { method: "POST", token, body: input }),

  getRecord: (token: string, id: string) =>
    request<RecordDto>(`/records/${id}`, { token }),

  updateRecord: (
    token: string,
    id: string,
    input: {
      title?: string;
      description?: string | null;
      status?: "active" | "archived";
    },
  ) => request<RecordDto>(`/records/${id}`, { method: "PATCH", token, body: input }),

  deleteRecord: (token: string, id: string) =>
    request<void>(`/records/${id}`, { method: "DELETE", token }),
};

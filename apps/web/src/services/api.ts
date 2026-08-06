import { API_BASE } from "./config";

type RequestOptions = {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
};

export type ApiProblemDetails = {
  code?: string;
  title?: string;
  detail?: unknown;
  requestId?: string;
  status?: number;
};

/** Preserves RFC 9457/problem-details fields for actionable UI feedback. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly title?: string;
  readonly detail?: unknown;
  readonly requestId?: string;

  constructor(status: number, problem: ApiProblemDetails, statusText?: string) {
    const detail = typeof problem.detail === "string" ? problem.detail : undefined;
    const message = detail || problem.title || problem.code || `请求失败（${status}）`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = problem.code;
    this.title = problem.title;
    this.detail = problem.detail;
    this.requestId = problem.requestId;
    if (statusText) this.message = `${message}`;
  }
}

export function formatApiError(error: unknown, fallback = "请求失败") {
  if (!(error instanceof ApiError)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  return error.requestId
    ? `${error.message}（请求 ID：${error.requestId}）`
    : error.message;
}

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(path, API_BASE);
  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let problem: ApiProblemDetails = {};
    try {
      const body = (await res.clone().json()) as unknown;
      if (body && typeof body === "object") {
        const candidate = body as Record<string, unknown>;
        const nested = candidate.error;
        problem = (nested && typeof nested === "object"
          ? nested
          : candidate) as ApiProblemDetails;
      }
    } catch {
      // Some proxies return an empty/non-JSON error body.
    }
    problem.requestId ??= res.headers.get("x-request-id") ?? undefined;
    problem.status ??= res.status;
    throw new ApiError(res.status, problem, res.statusText);
  }

  return res.json() as Promise<T>;
}

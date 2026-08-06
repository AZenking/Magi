/**
 * Shared Playwright test fixtures and API helpers.
 *
 * The `api` fixture is an `APIRequestContext` pointed at the MAGI backend
 * (http://localhost:3001 by default) that inherits the logged-in session
 * cookies from the storage state. Use it for test setup/teardown (seed a
 * source, restore a channel lifecycle, clean up residuals) so specs stay
 * deterministic without coupling to the UI for bookkeeping.
 */
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

/** API base URL — the NestJS backend (no global prefix). */
export const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:3001";

/**
 * Wait for an SSR page to be interactive. TanStack Start ships server-rendered
 * HTML, so the DOM is present immediately but React event handlers attach only
 * after hydration. `networkidle` is unreliable here (the dashboard polls task
 * status continuously), so we wait for DOMContentLoaded plus a short hydration
 * buffer. Callers that need data should additionally wait on a specific element.
 */
export async function waitForReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
}

export type SourceType = "m3u" | "xmltv";

export interface SourceSeed {
  name: string;
  url: string;
  enabled?: boolean;
  type?: SourceType;
}

/** A channel row returned by GET /output/channels. */
export interface ChannelVo {
  id: string;
  standardName: string;
  hidden: boolean;
  lifecycle?: string;
  version?: number;
}

/** Generate a unique, human-readable name to avoid cross-run collisions. */
export function uniqueName(prefix: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${stamp}-${rand}`;
}

/** Create a source via the API (used for setup/teardown, not the CRUD spec). */
export async function createSourceByApi(
  api: APIRequestContext,
  type: SourceType,
  seed: SourceSeed,
): Promise<{ id: string }> {
  const res = await api.post("/sources", {
    data: { enabled: true, ...seed, type: seed.type ?? type },
  });
  if (!res.ok()) {
    throw new Error(`createSourceByApi failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  return { id: body.data.id };
}

/** Hard-delete a source via the API (teardown safety net). */
export async function deleteSourceByApi(
  api: APIRequestContext,
  type: SourceType,
  id: string,
): Promise<void> {
  const res = await api.delete(`/sources/${type}/${id}`);
  // 204 / 404 are both acceptable end states for cleanup.
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`deleteSourceByApi failed: ${res.status()} ${await res.text()}`);
  }
}

/** Fetch the first N channels in a given lifecycle (default: active). */
export async function listChannelsByApi(
  api: APIRequestContext,
  opts: { lifecycle?: string; pageSize?: number } = {},
): Promise<ChannelVo[]> {
  const { lifecycle = "active", pageSize = 20 } = opts;
  const res = await api.get("/output/channels", {
    params: { lifecycle, pageSize, page: 1 },
  });
  if (!res.ok()) {
    throw new Error(`listChannelsByApi failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  return (body.data?.items ?? []) as ChannelVo[];
}

/** Move a channel to another lifecycle via POST /output/channels/:id/lifecycle. */
export async function restoreChannelByApi(
  api: APIRequestContext,
  channel: { id: string; version?: number },
  target: string = "active",
): Promise<void> {
  const res = await api.post(`/output/channels/${channel.id}/lifecycle`, {
    headers: { "If-Match": `"${channel.version ?? 1}"` },
    data: { target },
  });
  if (!res.ok() && res.status() !== 409) {
    // 409 = stale version; ignore — the row is already in the target state.
    throw new Error(`restoreChannelByApi failed: ${res.status()} ${await res.text()}`);
  }
}

/**
 * Read a single channel's current lifecycle via the detail endpoint. Used to
 * assert lifecycle transitions precisely — the list view is paginated, so a
 * channel buried among thousands of hidden rows won't appear on page 1.
 */
export async function getChannelByApi(
  api: APIRequestContext,
  id: string,
): Promise<ChannelVo> {
  const res = await api.get(`/output/channels/${id}`);
  if (!res.ok()) {
    throw new Error(`getChannelByApi failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  // Detail shape: { data: { channel: {...}, streams: [...] } }
  return (body.data?.channel ?? body.data) as ChannelVo;
}

/**
 * Extended test object. `api` is scoped per-worker and shares the storage
 * state so authenticated requests just work.
 */
export const test = base.extend<{ api: APIRequestContext }>({
  api: async ({ playwright }, use) => {
    const api = await playwright.request.newContext({
      baseURL: API_BASE_URL,
      storageState: "e2e/.auth/user.json",
      extraHTTPHeaders: { "Content-Type": "application/json" },
    });
    await use(api);
    await api.dispose();
  },
});

export { expect };

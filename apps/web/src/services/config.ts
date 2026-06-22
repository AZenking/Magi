const DEV_FALLBACK = "http://localhost:3001";
const DEFAULT_API_PORT = "3001";

declare global {
  interface Window {
    __ENV__?: { API_URL?: string; API_PORT?: string };
  }
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveBrowser(): string {
  if (typeof window !== "undefined") {
    const injected = clean(window.__ENV__?.API_URL);
    if (injected) return injected;

    const apiPort = clean(window.__ENV__?.API_PORT) ?? DEFAULT_API_PORT;
    const protocol = window.location.protocol || "http:";
    const hostname = window.location.hostname;
    if (hostname) return `${protocol}//${hostname}:${apiPort}`;
  }
  return clean(import.meta.env.VITE_API_URL) ?? DEV_FALLBACK;
}

function resolveServer(): string {
  const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return clean(runtimeEnv?.VITE_API_URL) ?? clean(import.meta.env.VITE_API_URL) ?? DEV_FALLBACK;
}

export const API_BASE =
  typeof window !== "undefined" ? resolveBrowser() : resolveServer();

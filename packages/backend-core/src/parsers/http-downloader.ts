export interface DownloadOptions {
  timeout?: number;
  headers?: Record<string, string>;
}

export interface DownloadResult {
  content: string;
  statusCode: number;
}

export async function downloadSource(
  url: string,
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeout ?? 30000,
  );

  try {
    const headers: Record<string, string> = {
      "User-Agent": "MAGI-EPG/1.0",
      ...options.headers,
    };

    const res = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    if (!res.ok) {
      return { content: "", statusCode: res.status };
    }

    const content = await res.text();
    return { content, statusCode: res.status };
  } finally {
    clearTimeout(timeout);
  }
}

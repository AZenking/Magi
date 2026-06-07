import { eq } from "drizzle-orm";
import { db } from "../db";
import { m3uSources, xmltvSources } from "../schema";

interface SourceCheckResult {
  status: "online" | "offline";
  responseTime: number;
  error?: string;
}

export async function processSourceCheck(
  sourceType: "m3u" | "xmltv",
  sourceId: string,
  progress?: { updateProgress(pct: number, step: string): Promise<void> },
): Promise<SourceCheckResult> {
  await progress?.updateProgress(5, "fetch");

  const table = sourceType === "m3u" ? m3uSources : xmltvSources;
  const [source] = await db.select({ id: table.id, url: table.url }).from(table).where(eq(table.id, sourceId)).limit(1);

  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  await progress?.updateProgress(20, "check");

  const result = await checkSourceUrl(source.url);

  await progress?.updateProgress(80, "update");

  const now = new Date();
  if (result.status === "online") {
    await db.update(table).set({
      lastCheckAt: now,
      checkStatus: "online",
      checkResponseTime: result.responseTime,
      checkError: null,
      qualityScore: computeQualityScore(result.responseTime),
    }).where(eq(table.id, sourceId));
  } else {
    await db.update(table).set({
      lastCheckAt: now,
      checkStatus: "offline",
      checkResponseTime: result.responseTime,
      checkError: result.error?.slice(0, 500) ?? "Check failed",
    }).where(eq(table.id, sourceId));
  }

  await progress?.updateProgress(100, "done");

  return result;
}

async function checkSourceUrl(url: string): Promise<SourceCheckResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    // Try HEAD first
    let res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    // Fallback to GET on 405/403 (some servers reject HEAD)
    if (res.status === 405 || res.status === 403) {
      clearTimeout(timeout);
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 15_000);
      res = await fetch(url, {
        method: "GET",
        signal: controller2.signal,
        redirect: "follow",
        headers: { Range: "bytes=0-1023" },
      });
      clearTimeout(timeout2);
    } else {
      clearTimeout(timeout);
    }

    const responseTime = Date.now() - start;
    const ok = res.status < 400;
    return {
      status: ok ? "online" : "offline",
      responseTime,
      error: ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      status: "offline",
      responseTime: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

function computeQualityScore(responseTime: number): number {
  // Score: 0-100, higher is better
  if (responseTime < 200) return 100;
  if (responseTime < 500) return 90;
  if (responseTime < 1000) return 75;
  if (responseTime < 3000) return 50;
  if (responseTime < 5000) return 25;
  return 10;
}

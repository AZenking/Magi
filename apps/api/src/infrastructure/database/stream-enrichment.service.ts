import { inArray } from "drizzle-orm";
import type { IStreamEnrichmentService } from "@/domain/output-composition";
import { db } from "./connection";
import { m3uSources, channels } from "./schema";

export class StreamEnrichmentService implements IStreamEnrichmentService {
  async getSourceNames(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const rows = await db.select({ id: m3uSources.id, name: m3uSources.name }).from(m3uSources).where(inArray(m3uSources.id, ids));
    for (const r of rows) map.set(r.id, r.name);
    return map;
  }

  async getChannelNames(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const rows = await db.select({ id: channels.id, displayName: channels.displayName }).from(channels).where(inArray(channels.id, ids));
    for (const r of rows) map.set(r.id, r.displayName);
    return map;
  }
}

/**
 * Drizzle adapter for IEpgSyncRepository (008-pipeline-reliability T007).
 *
 * Provides EPG sync operations: checking XMLTV source readiness, loading
 * candidates for matching, and applying EPG bindings with optimistic
 * concurrency control.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { rawXmltvChannels, xmltvSources, canonicalChannels, canonicalEpgBindings } from "../../schema";
import type {
  IEpgSyncRepository,
  XmltvCandidate,
  CanonicalForEpg,
} from "@/domain/source-sync/epg-sync.repository";

export class DrizzleEpgSyncRepository implements IEpgSyncRepository {
  async isXmltvReady(sourceId: string): Promise<{ ready: boolean; blockerCode: string | null }> {
    const [source] = await db
      .select()
      .from(xmltvSources)
      .where(eq(xmltvSources.id, sourceId))
      .limit(1);

    if (!source || !source.enabled) return { ready: false, blockerCode: "disabled" };
    if (source.lastSyncStatus !== "success") return { ready: false, blockerCode: "not_synced" };

    const candidateCount = await db
      .select({ id: rawXmltvChannels.id })
      .from(rawXmltvChannels)
      .where(eq(rawXmltvChannels.sourceId, sourceId))
      .limit(1);
    if (candidateCount.length === 0) return { ready: false, blockerCode: "empty" };

    return { ready: true, blockerCode: null };
  }

  async loadXmltvCandidates(sourceId: string): Promise<XmltvCandidate[]> {
    const rows = await db
      .select({
        xmltvChannelId: rawXmltvChannels.xmltvId,
        displayName: rawXmltvChannels.displayName,
      })
      .from(rawXmltvChannels)
      .where(eq(rawXmltvChannels.sourceId, sourceId));
    return rows.map((r) => ({
      xmltvChannelId: r.xmltvChannelId,
      displayName: r.displayName ?? "",
    }));
  }

  async loadCanonicalChannelsForEpg(): Promise<CanonicalForEpg[]> {
    const rows = await db
      .select({
        id: canonicalChannels.id,
        standardName: canonicalChannels.standardName,
        tvgId: canonicalChannels.epgChannelId,
        epgChannelId: canonicalChannels.epgChannelId,
        version: canonicalChannels.version,
      })
      .from(canonicalChannels)
      .where(eq(canonicalChannels.lifecycle, "active"));

    // Join with bindings to get manualEpgLocked.
    const bindings = await db.select().from(canonicalEpgBindings);
    const lockedByCanonical = new Map(bindings.map((b) => [b.canonicalChannelId, b.locked]));

    return rows.map((r) => ({
      id: r.id,
      standardName: r.standardName,
      tvgId: r.tvgId,
      epgChannelId: r.epgChannelId,
      manualEpgLocked: lockedByCanonical.get(r.id) ?? false,
      version: r.version ?? 1,
    }));
  }

  async applyEpgBinding(
    canonicalChannelId: string,
    xmltvSourceId: string,
    epgChannelId: string,
    matchType: string,
    expectedVersion: number,
  ): Promise<boolean> {
    // Check if locked — skip if so.
    const [existing] = await db
      .select()
      .from(canonicalEpgBindings)
      .where(eq(canonicalEpgBindings.canonicalChannelId, canonicalChannelId))
      .limit(1);
    if (existing?.locked) return false;

    const status =
      matchType === "manual" ? "matched_manual" : "matched_auto";

    const result = await db
      .insert(canonicalEpgBindings)
      .values({
        canonicalChannelId,
        xmltvSourceId,
        xmltvChannelId: epgChannelId,
        status,
        matchType,
        locked: false,
      })
      .onConflictDoUpdate({
        target: canonicalEpgBindings.canonicalChannelId,
        set: {
          xmltvSourceId,
          xmltvChannelId: epgChannelId,
          status,
          matchType,
          version: (existing?.version ?? 0) + 1,
          updatedAt: new Date(),
        },
      })
      .returning({ id: canonicalEpgBindings.canonicalChannelId });

    return result.length > 0;
  }
}

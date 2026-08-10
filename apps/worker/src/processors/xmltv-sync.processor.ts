import { eq, sql } from "drizzle-orm";
import { chunk, safeBatchSize } from "@magi/utils";
import { db } from "../db";
import { contentManifest, xmltvSources, rawXmltvChannels, programmes } from "../schema";
import { downloadSource, parseXMLTV, parseXmltvDate, isInEpgWindow } from "@magi/backend-core";
import type { SyncProgress } from "@magi/backend-core";

const PROGRAMME_BATCH_SIZE = 1000;

interface SyncResult {
  importedCount: number;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
}

interface SyncBatchResult {
  totalSources: number;
  succeededSources: number;
  failedSources: number;
  results: Array<{ sourceId: string; status: "success" | "failed"; error?: string }>;
}

/**
 * Process an XMLTV source sync. When `sourceId` is null (scheduled/timer
 * invocation), fans out across all enabled XMLTV sources (008-pipeline-
 * reliability T014).
 */
export async function processXmltvSync(
  sourceId: string | null,
  progress?: SyncProgress,
): Promise<SyncResult | SyncBatchResult> {
  if (!sourceId) {
    const enabledSources = await db
      .select({ id: xmltvSources.id })
      .from(xmltvSources)
      .where(eq(xmltvSources.enabled, true));

    const results: Array<{ sourceId: string; status: "success" | "failed"; error?: string }> = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < enabledSources.length; i++) {
      const sid = enabledSources[i]!.id;
      try {
        await processXmltvSync(sid, undefined);
        succeeded++;
        results.push({ sourceId: sid, status: "success" });
      } catch (error) {
        failed++;
        results.push({
          sourceId: sid,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await progress?.updateProgress(
        Math.round(((i + 1) / enabledSources.length) * 100),
        "batch-sync",
      );
    }

    return { totalSources: enabledSources.length, succeededSources: succeeded, failedSources: failed, results };
  }

  const [source] = await db.select().from(xmltvSources).where(eq(xmltvSources.id, sourceId)).limit(1);
  if (!source || !source.enabled) {
    throw new Error("Source not found or disabled");
  }

  await progress?.updateProgress(10, "download");

  const { content, statusCode } = await downloadSource(source.url, {
    headers: source.headers ?? undefined,
  });

  if (statusCode !== 200 || !content) {
    await db.update(xmltvSources).set({
      lastSyncAt: new Date(),
      lastSyncStatus: "failed",
      updatedAt: new Date(),
    }).where(eq(xmltvSources.id, sourceId));
    throw new Error(`Download failed: HTTP ${statusCode}`);
  }

  await progress?.updateProgress(40, "parse");

  const data = parseXMLTV(content);
  const now = new Date();
  const filteredProgrammes = data.programmes.filter((p) => isInEpgWindow(p.start, p.stop));

  await progress?.updateProgress(55, "write-channels");

  const totalBatches = Math.ceil(filteredProgrammes.length / PROGRAMME_BATCH_SIZE);

  await db.transaction(async (tx) => {
    await tx.delete(rawXmltvChannels).where(eq(rawXmltvChannels.sourceId, sourceId));
    await tx.delete(programmes).where(eq(programmes.sourceId, sourceId));

    if (data.channels.length > 0) {
      const channelRows = data.channels.map((ch) => ({
        sourceId,
        xmltvId: ch.id,
        displayName: ch.displayName,
        icon: ch.icon,
        syncedAt: now,
      }));
      for (const batch of chunk(channelRows, safeBatchSize(5))) {
        await tx.insert(rawXmltvChannels).values(batch);
      }
    }

    for (let i = 0; i < filteredProgrammes.length; i += PROGRAMME_BATCH_SIZE) {
      const batchIndex = Math.floor(i / PROGRAMME_BATCH_SIZE);
      const batch = filteredProgrammes.slice(i, i + PROGRAMME_BATCH_SIZE);
      try {
        await tx.insert(programmes).values(
          batch.map((p) => ({
            sourceId,
            xmltvChannelId: p.channel,
            title: p.title || null,
            subTitle: p.subTitle || null,
            desc: p.desc || null,
            category: p.category || null,
            startAt: parseXmltvDate(p.start),
            stopAt: parseXmltvDate(p.stop),
          })),
        );
      } catch (err) {
        throw new Error(
          `Programme insert failed at batch ${batchIndex + 1}/${totalBatches} (sourceId=${sourceId}): ${err instanceof Error ? err.message : err}`,
          { cause: err },
        );
      }
      await progress?.updateProgress(
        60 + Math.round((batchIndex + 1) / totalBatches * 25),
        "write-programmes",
      );
    }

    // Programme replacement is the atomic boundary for EPG invalidation.
    // Seed at 2 so the first successful sync is visible to clients that
    // started with the migration's initial revision 1.
    await tx
      .insert(contentManifest)
      .values({ id: 1, epgRevision: 2, updatedAt: now })
      .onConflictDoUpdate({
        target: contentManifest.id,
        set: {
          epgRevision: sql`${contentManifest.epgRevision} + 1`,
          updatedAt: now,
        },
      });
  });

  await progress?.updateProgress(90, "finalize");

  await db.update(xmltvSources).set({
    lastSyncAt: now,
    lastSyncStatus: "success",
    updatedAt: new Date(),
  }).where(eq(xmltvSources.id, sourceId));

  return {
    importedCount: data.channels.length + filteredProgrammes.length,
    addedCount: data.channels.length,
    updatedCount: 0,
    removedCount: 0,
  };
}

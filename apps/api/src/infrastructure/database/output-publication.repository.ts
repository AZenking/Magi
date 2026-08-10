/**
 * Drizzle implementation of IOutputPublicationRepository (T009, 009).
 *
 * The publication projection is a single row per scope (default "primary")
 * capturing the last-known successful state of the dynamically generated
 * M3U directory. The playlist endpoint does NOT read this row to render
 * content — it generates fresh on demand. This row is the management UI's
 * source of truth for "what's currently being served".
 */
import { eq } from "drizzle-orm";
import { db } from "./connection";
import { outputPublications } from "./schema";
import type { IOutputPublicationRepository } from "@/domain/output-composition";
import type { OutputPublicationVo } from "@magi/types";

function toVo(
  row: typeof outputPublications.$inferSelect,
): OutputPublicationVo {
  return {
    revision: row.revision,
    status: row.status as OutputPublicationVo["status"],
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    channelCount: row.channelCount,
    playableChannelCount: row.playableChannelCount,
    excludedChannelCount: row.excludedChannelCount,
    blockingReason: row.blockingReason,
  };
}

const PRIMARY_SCOPE = "primary";

export class OutputPublicationRepository implements IOutputPublicationRepository {
  async read(
    scope: string = PRIMARY_SCOPE,
  ): Promise<OutputPublicationVo | null> {
    const [row] = await db
      .select()
      .from(outputPublications)
      .where(eq(outputPublications.scope, scope))
      .limit(1);
    return row ? toVo(row) : null;
  }

  async upsert(input: {
    scope: string;
    revision: string;
    status: OutputPublicationVo["status"];
    publishedAt: Date | null;
    channelCount: number;
    playableChannelCount: number;
    excludedChannelCount: number;
    blockingReason: string | null;
    lastApplyChangeSetId: string | null;
  }): Promise<OutputPublicationVo> {
    const now = new Date();
    const [row] = await db
      .insert(outputPublications)
      .values({
        scope: input.scope,
        revision: input.revision,
        status: input.status,
        publishedAt: input.publishedAt,
        channelCount: input.channelCount,
        playableChannelCount: input.playableChannelCount,
        excludedChannelCount: input.excludedChannelCount,
        blockingReason: input.blockingReason,
        lastApplyChangeSetId: input.lastApplyChangeSetId,
      })
      .onConflictDoUpdate({
        target: outputPublications.scope,
        set: {
          revision: input.revision,
          status: input.status,
          publishedAt: input.publishedAt,
          channelCount: input.channelCount,
          playableChannelCount: input.playableChannelCount,
          excludedChannelCount: input.excludedChannelCount,
          blockingReason: input.blockingReason,
          lastApplyChangeSetId: input.lastApplyChangeSetId,
          updatedAt: now,
        },
      })
      .returning();
    return toVo(row!);
  }
}

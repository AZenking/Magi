/**
 * SourceChannelIdentityAlias Drizzle repository (T035).
 *
 * Preserves identity continuity when upstream IDs or the identity algorithm
 * change (data-model.md). Ambiguous aliases become blockers — never auto-resolved.
 */
import { eq, and } from "drizzle-orm";
import { db } from "./connection";
import { sourceChannelIdentityAliases } from "./schema";

export interface IdentityAliasRow {
  id: string;
  sourceId: string;
  alias: string;
  aliasType: string;
  sourceChannelId: string;
  active: boolean;
  createdAt: Date;
}

function toDomain(row: typeof sourceChannelIdentityAliases.$inferSelect): IdentityAliasRow {
  return { ...row };
}

export class SourceChannelIdentityAliasRepository {
  /** Resolve an alias to its stable target channel. Returns null if absent. */
  async resolveAlias(sourceId: string, alias: string): Promise<IdentityAliasRow | null> {
    const [row] = await db
      .select()
      .from(sourceChannelIdentityAliases)
      .where(
        and(
          eq(sourceChannelIdentityAliases.sourceId, sourceId),
          eq(sourceChannelIdentityAliases.alias, alias),
          eq(sourceChannelIdentityAliases.active, true),
        ),
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  /** Count active targets for an alias — >1 means ambiguous (blocker). */
  async countActiveTargets(sourceId: string, alias: string): Promise<number> {
    const rows = await db
      .select()
      .from(sourceChannelIdentityAliases)
      .where(
        and(
          eq(sourceChannelIdentityAliases.sourceId, sourceId),
          eq(sourceChannelIdentityAliases.alias, alias),
          eq(sourceChannelIdentityAliases.active, true),
        ),
      );
    return rows.length;
  }

  async create(data: {
    sourceId: string;
    alias: string;
    aliasType: string;
    sourceChannelId: string;
  }): Promise<IdentityAliasRow> {
    const [row] = await db
      .insert(sourceChannelIdentityAliases)
      .values({
        sourceId: data.sourceId,
        alias: data.alias,
        aliasType: data.aliasType,
        sourceChannelId: data.sourceChannelId,
        active: true,
      })
      .returning();
    return toDomain(row!);
  }

  async findBySourceChannelId(sourceChannelId: string): Promise<IdentityAliasRow[]> {
    const rows = await db
      .select()
      .from(sourceChannelIdentityAliases)
      .where(eq(sourceChannelIdentityAliases.sourceChannelId, sourceChannelId));
    return rows.map(toDomain);
  }
}

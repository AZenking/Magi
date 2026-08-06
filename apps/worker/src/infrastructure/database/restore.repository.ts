/**
 * Drizzle adapter for IRestorePort (008-pipeline-reliability T008).
 *
 * Restores captured objects by upserting them back to their original tables.
 * The entityType field determines the target table via a dispatch map.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { channels, canonicalChannels } from "../../schema";
import type { IRestorePort, RestoreItem } from "@/application/operation-safety/apply-recovery-restore.use-case";

export class DrizzleRestoreRepository implements IRestorePort {
  async restoreObject(item: RestoreItem): Promise<void> {
    const payload = item.payload;
    switch (item.entityType) {
      case "channel":
        await db
          .insert(channels)
          .values({
            id: item.entityId,
            channelIdentity: payload.channelIdentity as string,
            m3uSourceId: payload.m3uSourceId as string | null,
            displayName: payload.displayName as string,
            groupTitle: payload.groupTitle as string | null,
            tvgId: payload.tvgId as string | null,
            tvgLogo: payload.tvgLogo as string | null,
            streamUrl: payload.streamUrl as string | null,
            sourcePresence: (payload.sourcePresence as string) ?? "present",
            active: (payload.active as boolean) ?? true,
            version: item.entityVersion,
          })
          .onConflictDoUpdate({
            target: channels.id,
            set: {
              displayName: payload.displayName as string,
              groupTitle: payload.groupTitle as string | null,
              tvgId: payload.tvgId as string | null,
              tvgLogo: payload.tvgLogo as string | null,
              streamUrl: payload.streamUrl as string | null,
              sourcePresence: (payload.sourcePresence as string) ?? "present",
              active: (payload.active as boolean) ?? true,
              version: item.entityVersion,
            },
          });
        break;

      case "canonical_channel":
        await db
          .insert(canonicalChannels)
          .values({
            id: item.entityId,
            standardName: payload.standardName as string,
            standardGroup: payload.standardGroup as string | null,
            standardLogo: payload.standardLogo as string | null,
            outputStatus: (payload.outputStatus as string) ?? "active",
            lifecycle: (payload.lifecycle as string) ?? "active",
            disabled: (payload.disabled as boolean) ?? false,
            version: item.entityVersion,
          })
          .onConflictDoUpdate({
            target: canonicalChannels.id,
            set: {
              standardName: payload.standardName as string,
              standardGroup: payload.standardGroup as string | null,
              standardLogo: payload.standardLogo as string | null,
              outputStatus: (payload.outputStatus as string) ?? "active",
              disabled: (payload.disabled as boolean) ?? false,
              version: item.entityVersion,
            },
          });
        break;

      default:
        // Unknown entity types are silently skipped — the restore is best-effort
        // and must not crash on forward-compatible payload formats.
        break;
    }
  }
}

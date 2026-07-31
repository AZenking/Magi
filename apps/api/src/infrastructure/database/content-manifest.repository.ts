import { eq } from "drizzle-orm";
import type {
  ContentManifestRepository as ContentManifestRepositoryPort,
  ContentRevision,
} from "@/domain/content";
import { contentManifest } from "./schema";
import { db } from "./connection";

const SINGLETON_ID = 1;

export class ContentManifestRepository implements ContentManifestRepositoryPort {
  async getCurrent(): Promise<ContentRevision> {
    const [existing] = await db
      .select()
      .from(contentManifest)
      .where(eq(contentManifest.id, SINGLETON_ID))
      .limit(1);

    if (existing) {
      return {
        catalog: String(existing.catalogRevision),
        epg: String(existing.epgRevision),
      };
    }

    const [created] = await db
      .insert(contentManifest)
      .values({ id: SINGLETON_ID })
      .onConflictDoNothing({ target: contentManifest.id })
      .returning();

    if (created) {
      return {
        catalog: String(created.catalogRevision),
        epg: String(created.epgRevision),
      };
    }

    const [retried] = await db
      .select()
      .from(contentManifest)
      .where(eq(contentManifest.id, SINGLETON_ID))
      .limit(1);

    return {
      catalog: String(retried?.catalogRevision ?? 1),
      epg: String(retried?.epgRevision ?? 1),
    };
  }
}

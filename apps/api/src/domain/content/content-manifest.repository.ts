export interface ContentRevision {
  catalog: string;
  epg: string;
}

export interface ContentManifestRepository {
  getCurrent(): Promise<ContentRevision>;
}

export const CONTENT_MANIFEST_REPOSITORY = "CONTENT_MANIFEST_REPOSITORY";

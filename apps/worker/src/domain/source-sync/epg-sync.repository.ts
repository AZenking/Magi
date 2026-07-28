/**
 * EPG sync repository port (T039).
 *
 * Abstraction over XMLTV source + raw channel + canonical channel data needed
 * for EPG matching preview/apply. Implementations live in infrastructure/.
 */
export interface XmltvCandidate {
  readonly xmltvChannelId: string;
  readonly displayName: string;
}

export interface CanonicalForEpg {
  readonly id: string;
  readonly standardName: string;
  readonly tvgId: string | null;
  readonly epgChannelId: string | null;
  readonly manualEpgLocked: boolean;
  readonly version: number;
}

export interface IEpgSyncRepository {
  /** Load XMLTV candidates from a synced source. */
  loadXmltvCandidates(sourceId: string): Promise<XmltvCandidate[]>;

  /** Load canonical channels for matching (only those needing binding). */
  loadCanonicalChannelsForEpg(): Promise<CanonicalForEpg[]>;

  /** Apply an approved EPG binding to a canonical channel (preserves manual lock). */
  applyEpgBinding(
    canonicalChannelId: string,
    xmltvSourceId: string,
    epgChannelId: string,
    matchType: string,
    expectedVersion: number,
  ): Promise<boolean>;

  /** Is the XMLTV source enabled + successfully synced + non-empty + fresh? */
  isXmltvReady(sourceId: string): Promise<{ ready: boolean; blockerCode: string | null }>;
}

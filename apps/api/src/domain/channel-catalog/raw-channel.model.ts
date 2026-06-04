export interface RawM3uChannel {
  id: string;
  sourceId: string;
  tvgId: string;
  tvgName: string;
  tvgLogo: string;
  groupTitle: string;
  displayName: string;
  streamUrl: string;
  channelIdentity: string;
  syncedAt: Date;
  disappeared: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RawXmltvChannel {
  id: string;
  sourceId: string;
  xmltvId: string;
  displayName: string;
  icon: string;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

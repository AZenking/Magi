export interface ChannelOverride {
  id: string;
  channelId: string;
  customName: string | null;
  customGroup: string | null;
  customLogo: string | null;
  channelNumber: number | null;
  hidden: boolean;
  starred: boolean;
  manualEpgChannelId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

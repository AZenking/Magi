export interface ChannelVo {
  id: string;
  name: string;
  icon?: string;
  url?: string;
  status: string;
  epgSourceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProgrammeVo {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  start: string;
  stop: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EpgSourceVo {
  id: string;
  name: string;
  type: string;
  url: string;
  enabled: boolean;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskVo {
  id: string;
  type: string;
  status: string;
  progress?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

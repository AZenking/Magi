export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  SUCCESS = "success",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum EpgSourceType {
  M3U = "m3u",
  XMLTV = "xmltv",
  API = "api",
  SCRAPER = "scraper",
}

export enum ChannelStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

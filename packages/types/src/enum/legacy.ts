/**
 * Legacy enums (backward compatibility).
 *
 * These pre-date the Safe Operations feature and use the old `enum` syntax.
 * `TaskStatus.SUCCESS = "success"` is the **persisted DB value**; at the wire
 * boundary it is mapped to `TASK_WIRE_STATUS = "succeeded"`
 * (contracts/tasks.md). New feature code must use the const-array enums from
 * operation.ts / channel-lifecycle.ts / failover.ts instead.
 */
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

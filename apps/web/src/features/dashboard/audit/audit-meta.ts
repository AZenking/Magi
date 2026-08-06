/**
 * Audit display metadata (T107).
 *
 * Centralized labels and Tag colors for actor types and operation results.
 * Token-driven semantic colors (T001): success/warning/error/default map to
 * antd Tag color tokens so the theme controls the actual rendering.
 */
import type { ActorType, OperationResult } from "@magi/types";

export const AUDIT_ACTOR_LABELS: Record<ActorType, string> = {
  user: "用户",
  schedule: "调度",
  system: "系统",
};

export const AUDIT_RESULT_META: Record<
  OperationResult,
  { label: string; color: string }
> = {
  accepted: { label: "已受理", color: "processing" },
  succeeded: { label: "成功", color: "success" },
  failed: { label: "失败", color: "error" },
  skipped: { label: "跳过", color: "default" },
  cancelled: { label: "取消", color: "warning" },
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // Legacy action values remain visible/filterable for historical rows.
  "source.sync": "源同步（旧）",
  "epg.match": "EPG 匹配（旧）",
  "channel.lifecycle": "频道生命周期（旧）",
  "channel.purge": "频道清理",
  "backup.restore": "恢复备份",
  "recovery.restore": "恢复点恢复",
  "source.create": "创建数据源",
  "source.update": "修改数据源",
  "source.delete": "删除数据源",
  "source.sync.trigger": "触发源同步",
  "source.check.trigger": "触发源检测",
  "epg.match.trigger": "触发 EPG 匹配",
  "epg.import.trigger": "触发 EPG 导入",
  "epg.refresh.trigger": "触发 EPG 刷新",
  "channel.update": "修改频道",
  "channel.logo.update": "修改频道台标",
  "channel.lifecycle.change": "变更频道状态",
  "channel.epg_binding.update": "修改 EPG 绑定",
  "channel.batch.update": "批量修改频道",
  "channel.stream.create": "新增流地址",
  "channel.stream.update": "修改流地址",
  "channel.stream.delete": "删除流地址",
  "channel.stream.set_primary": "设置主流",
  "channel.stream.reorder": "调整流顺序",
  "channel.failover_policy.update": "修改故障切换策略",
  "channel.stream.check.trigger": "触发流检测",
  "schedule.update": "修改调度",
  "schedule.trigger": "人工触发调度",
  "task.retry": "重试任务",
  "task.cancel": "取消任务",
  "operation.apply": "应用操作方案",
  "operation.cancel": "取消操作方案",
  "backup.create": "创建备份",
  "backup.download": "下载备份",
  "oauth_client.created": "创建 OAuth 客户端",
  "oauth_client.disabled": "禁用 OAuth 客户端",
  "oauth_client.enabled": "启用 OAuth 客户端",
  "oauth_client.revoked": "吊销 OAuth 客户端",
  "oauth_client.deleted": "删除 OAuth 客户端",
  "oauth_client.secret_rotated": "轮换 OAuth Secret",
  "device_client.registered": "绑定设备客户端",
  "device_client.auto_registered": "自动登记设备",
  "device_client.renamed": "重命名设备客户端",
  "device_client.revoked": "撤销设备客户端",
  "device_client.restored": "解除设备撤销",
  "device_client.revoked_access_rejected": "拒绝已撤销设备访问",
};

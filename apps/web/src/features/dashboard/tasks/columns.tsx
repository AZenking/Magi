import type { ProColumns } from "@ant-design/pro-components";
import type { TaskVo } from "@magi/types";
import { Button, Progress, Tag, Typography } from "antd";
import { CloseOutlined, ReloadOutlined } from "@ant-design/icons";

const statusMap: Record<TaskVo["status"], { label: string; color?: string }> = {
  pending: { label: "等待中" },
  running: { label: "运行中", color: "processing" },
  success: { label: "成功", color: "success" },
  failed: { label: "失败", color: "error" },
  cancelled: { label: "已取消" },
};

// ProTable QueryFilter valueEnum for the status column. Mirrors `statusMap`
// labels so the select options match the rendered tags.
export const STATUS_VALUE_ENUM = {
  pending: { text: "等待中" },
  running: { text: "运行中" },
  success: { text: "成功" },
  failed: { text: "失败" },
  cancelled: { text: "已取消" },
};

const taskTypeMap: Record<string, string> = {
  "m3u-sync": "M3U 同步",
  "xmltv-sync": "XMLTV 同步",
  "epg-match": "EPG 匹配",
  "source-check": "源检查",
  "stream-check": "流检查",
  "import-epg": "导入 EPG",
  "refresh-epg": "刷新 EPG",
};

const queueNameMap: Record<string, string> = {
  "source-sync": "源同步",
  epg: "EPG",
  "health-check": "健康检查",
};

// ProTable QueryFilter valueEnum for the queueName column. Mirrors
// `queueNameMap` labels so the select options match the rendered text.
export const QUEUE_NAME_VALUE_ENUM = {
  "source-sync": { text: "源同步" },
  epg: { text: "EPG" },
  "health-check": { text: "健康检查" },
};

const dtf = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeStyle: "medium",
});

/**
 * Stable target ref used to scope per-row pending state. The list endpoint
 * returns the legacy `TaskVo` shape (no targetType/targetId pair on every
 * row), so we derive a target from sourceType/sourceId when present and fall
 * back to the task id itself. Combined with the task-registry, this keeps
 * unrelated rows from showing pending (FR-027 / contracts/tasks.md).
 */
export interface TaskTargetRef {
  taskId: string;
  targetType: string;
  targetId: string;
}

interface ColumnContext {
  onRetry?: (task: TaskVo) => void;
  onCancel?: (task: TaskVo) => void;
  /** Returns true if the row's task+target currently has a mutation in flight. */
  isPending?: (task: TaskVo) => boolean;
}

export function getTaskColumns(ctx?: ColumnContext): ProColumns<TaskVo>[] {
  return [
    {
      title: "任务类型",
      dataIndex: "taskType",
      search: false,
      ellipsis: true,
      render: (_, record) => taskTypeMap[record.taskType] ?? record.taskType,
    },
    {
      title: "队列",
      dataIndex: "queueName",
      valueType: "select",
      valueEnum: QUEUE_NAME_VALUE_ENUM,
      render: (_, record) =>
        queueNameMap[record.queueName ?? ""] ?? record.queueName ?? "-",
    },
    {
      title: "状态",
      dataIndex: "status",
      valueType: "select",
      valueEnum: STATUS_VALUE_ENUM,
      render: (_, record) => {
        const s = statusMap[record.status];
        if (!s) return <Tag>{record.status}</Tag>;
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: "进度",
      dataIndex: "progress",
      search: false,
      render: (_, record) => {
        if (record.status === "success") return "100%";
        if (record.status === "pending" || record.status === "cancelled")
          return "-";
        return (
          <Progress percent={record.progress} size="small" style={{ minWidth: 104 }} />
        );
      },
    },
    {
      title: "开始时间",
      dataIndex: "startedAt",
      search: false,
      render: (_, record) => dtf.format(new Date(record.startedAt)),
    },
    {
      title: "耗时",
      dataIndex: "duration",
      search: false,
      render: (_, record) => {
        const { startedAt, finishedAt, status } = record;
        if (status === "pending") return "-";
        const end = finishedAt ? new Date(finishedAt) : new Date();
        const ms = end.getTime() - new Date(startedAt).getTime();
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
      },
    },
    {
      title: "重试",
      dataIndex: "attemptsMade",
      search: false,
      render: (_, record) => {
        const a = record.attemptsMade;
        return a > 0 ? <Tag color="warning">{a}</Tag> : "-";
      },
    },
    {
      title: "导入",
      dataIndex: "importedCount",
      search: false,
      render: (_, record) => record.importedCount || "-",
    },
    {
      title: "错误",
      dataIndex: "error",
      search: false,
      ellipsis: true,
      width: 200,
      render: (_, record) => {
        if (!record.error) return "-";
        return (
          <Typography.Text
            type="danger"
            ellipsis={{ tooltip: record.error }}
            style={{ maxWidth: 200 }}
          >
            {record.error}
          </Typography.Text>
        );
      },
    },
    {
      title: "操作",
      valueType: "option",
      hideInSetting: true,
      fixed: "right",
      width: 80,
      render: (_, record) => {
        const pending = ctx?.isPending?.(record) ?? false;
        if (record.status === "failed" && ctx?.onRetry) {
          return [
            <Button
              key="retry"
              type="text"
              icon={<ReloadOutlined spin={pending} />}
              onClick={(e) => {
                e.stopPropagation();
                ctx.onRetry!(record);
              }}
              disabled={pending}
              aria-label="重试"
            />,
          ];
        }
        if (record.status === "pending" && ctx?.onCancel) {
          return [
            <Button
              key="cancel"
              type="text"
              icon={<CloseOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                ctx.onCancel!(record);
              }}
              disabled={pending}
              aria-label="取消"
            />,
          ];
        }
        return [];
      },
    },
  ];
}

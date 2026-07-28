/**
 * TaskListItem — BasicList-style row renderer for the tasks ProList.
 *
 * Maps a TaskVo to the BasicList card layout: avatar (task-type icon) +
 * title (type name + status tag) + description (queue · duration · started
 * · imported) + content (progress bar when in-flight/failed) + actions
 * (retry on failed, cancel on pending). Pure presentational; the parent
 * wires retry/cancel and row-click.
 */
import type { ReactNode } from "react";
import { Button, Progress, Tag, Typography } from "antd";
import {
  CloudSyncOutlined,
  CloseOutlined,
  HeartOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  ProfileOutlined,
} from "@ant-design/icons";
import type { TaskVo } from "@magi/types";

const statusMap: Record<TaskVo["status"], { label: string; color?: string }> = {
  pending: { label: "等待中" },
  running: { label: "运行中", color: "processing" },
  success: { label: "成功", color: "success" },
  failed: { label: "失败", color: "error" },
  cancelled: { label: "已取消" },
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

// Task-type → icon. Falls back to a generic profile icon.
const taskTypeIcon: Record<string, ReactNode> = {
  "m3u-sync": <CloudSyncOutlined />,
  "xmltv-sync": <CloudSyncOutlined />,
  "epg-match": <ThunderboltOutlined />,
  "source-check": <HeartOutlined />,
  "stream-check": <HeartOutlined />,
  "import-epg": <CloudSyncOutlined />,
  "refresh-epg": <ReloadOutlined />,
};

const dtf = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeStyle: "medium",
});

function formatDuration(task: TaskVo): string {
  if (task.status === "pending") return "-";
  const end = task.finishedAt ? new Date(task.finishedAt) : new Date();
  const ms = end.getTime() - new Date(task.startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function taskAvatar(task: TaskVo): ReactNode {
  return taskTypeIcon[task.taskType] ?? <ProfileOutlined />;
}

export function taskTitle(task: TaskVo): ReactNode {
  const s = statusMap[task.status] ?? { label: task.status };
  return (
    <Typography.Text strong>
      {taskTypeMap[task.taskType] ?? task.taskType}
      <Tag color={s.color} style={{ marginLeft: 8 }}>
        {s.label}
      </Tag>
    </Typography.Text>
  );
}

export function taskDescription(task: TaskVo): ReactNode {
  const queue = task.queueName ? (queueNameMap[task.queueName] ?? task.queueName) : "-";
  const imported = task.importedCount > 0 ? `导入 ${task.importedCount}` : null;
  const parts = [
    queue,
    `耗时 ${formatDuration(task)}`,
    dtf.format(new Date(task.startedAt)),
    imported,
  ].filter(Boolean);
  return <Typography.Text type="secondary">{parts.join(" · ")}</Typography.Text>;
}

export function taskContent(task: TaskVo): ReactNode {
  if (task.status === "success" || task.status === "cancelled" || task.status === "pending") {
    return null;
  }
  return (
    <Progress
      percent={task.status === "failed" ? 100 : task.progress}
      status={task.status === "failed" ? "exception" : "active"}
      size="small"
      style={{ maxWidth: 480, marginTop: 8 }}
    />
  );
}

export interface TaskActionsContext {
  onRetry?: (task: TaskVo) => void;
  onCancel?: (task: TaskVo) => void;
  isPending?: (task: TaskVo) => boolean;
}

export function taskActions(task: TaskVo, ctx?: TaskActionsContext): ReactNode[] {
  const actions: ReactNode[] = [];
  const pending = ctx?.isPending?.(task) ?? false;
  if (task.status === "failed" && ctx?.onRetry) {
    actions.push(
      <Button
        key="retry"
        type="link"
        size="small"
        icon={<ReloadOutlined spin={pending} />}
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          ctx.onRetry!(task);
        }}
      >
        重试
      </Button>,
    );
  }
  if (task.status === "running" && ctx?.onCancel) {
    actions.push(
      <Button
        key="cancel"
        type="link"
        size="small"
        danger
        icon={<CloseOutlined />}
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          ctx.onCancel!(task);
        }}
      >
        取消
      </Button>,
    );
  }
  return actions;
}

/**
 * Global task status indicator (T090).
 *
 * Sits in the header and shows running / failed counts plus a popover with
 * the most recent compact task list. Polls the summary endpoint every 5s
 * while any task is active and stops when idle (contracts/tasks.md
 * "Polling obligations").
 */
import { Badge, Button, Flex, Popover, Spin, Tag, Typography, theme } from "antd";
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Link } from "@tanstack/react-router";
import { useTaskSummary } from "@/features/dashboard/tasks/task-queries";

/** Status badge color from a wire status (new + legacy). */
function statusTagColor(status: string): string {
  switch (status) {
    case "running":
      return "processing";
    case "succeeded":
    case "success":
      return "success";
    case "failed":
      return "error";
    case "cancelled":
      return "default";
    default:
      return "default";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "等待中";
    case "running":
      return "运行中";
    case "succeeded":
    case "success":
      return "成功";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

export function GlobalTaskStatus() {
  const { token } = theme.useToken();
  const { data, isLoading, isError } = useTaskSummary();

  const running = data?.runningCount ?? 0;
  const failed = data?.failedCount ?? 0;
  const recent = data?.items ?? [];

  // Idle: nothing to surface. Render a quiet placeholder so the header stays
  // stable rather than flickering in/out.
  const idle = running === 0 && failed === 0 && recent.length === 0;

  // Choose an icon/colour for the badge: error wins over running over idle.
  const badgeStatus: "error" | "processing" | "default" =
    failed > 0 ? "error" : running > 0 ? "processing" : "default";
  const dotIcon = isLoading ? (
    <LoadingOutlined style={{ color: token.colorTextSecondary }} />
  ) : failed > 0 ? (
    <ExclamationCircleOutlined style={{ color: token.colorError }} />
  ) : running > 0 ? (
    <ThunderboltOutlined style={{ color: token.colorPrimary }} />
  ) : (
    <CheckCircleOutlined style={{ color: token.colorSuccess }} />
  );

  const content = (
    <div style={{ width: 280, maxHeight: 360, overflowY: "auto" }}>
      <Flex vertical gap={token.marginSM}>
        <Flex gap={token.marginSM}>
          <Tag color="processing">运行中 {running}</Tag>
          <Tag color="error">失败 {failed}</Tag>
        </Flex>
        {recent.length === 0 ? (
          <Typography.Text type="secondary">暂无近期任务</Typography.Text>
        ) : (
          recent.map((item) => (
            <Flex
              key={item.id}
              align="center"
              justify="space-between"
              gap={token.marginXS}
            >
              <Typography.Text ellipsis style={{ minWidth: 0, flex: 1 }}>
                {item.targetDisplayName}
              </Typography.Text>
              <Tag color={statusTagColor(item.status)}>
                {statusLabel(item.status)}
              </Tag>
            </Flex>
          ))
        )}
        <Link to="/dashboard/tasks">
          <Button type="link" size="small" style={{ padding: 0 }}>
            查看全部任务
          </Button>
        </Link>
      </Flex>
    </div>
  );

  const trigger = (
    <Button
      type="text"
      aria-label={`任务状态：运行中 ${running}，失败 ${failed}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: token.marginXXS,
        height: token.controlHeightLG,
        paddingInline: token.paddingXS,
      }}
    >
      <Badge status={badgeStatus} dot={!idle} offset={[-2, 2]}>
        {dotIcon}
      </Badge>
      {!idle && (
        <Typography.Text type="secondary">
          {running > 0 ? running : failed}
        </Typography.Text>
      )}
    </Button>
  );

  if (isError) {
    // Soft-fail: don't surface a hard error in the header.
    return trigger;
  }

  return (
    <Popover
      content={content}
      title="任务状态"
      trigger="hover"
      placement="bottomRight"
      arrow
    >
      {trigger}
    </Popover>
  );
}

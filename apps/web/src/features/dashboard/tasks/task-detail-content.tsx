import type { TaskVo } from "@magi/types";
import type {
  TaskCapabilities,
  TaskRelations,
  TaskResult,
} from "@magi/types";
import {
  Alert,
  Button,
  Card,
  Flex,
  Progress,
  Tag,
  Typography,
  theme,
} from "antd";
import {
  CloseOutlined,
  LinkOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { ProDescriptions } from "@ant-design/pro-components";

const statusMap: Record<string, { label: string; color?: string }> = {
  pending: { label: "等待中" },
  running: { label: "运行中", color: "processing" },
  success: { label: "成功", color: "success" },
  succeeded: { label: "成功", color: "success" },
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

const dtf = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeStyle: "medium",
});

/**
 * Display-ready task shape. Backwards compatible with the legacy TaskVo (so the
 * existing test fixtures keep working) while accepting the newer TaskDetailVo
 * wire fields — stage/capabilities/relations/result — when the new endpoint
 * supplies them (T088).
 */
export interface DisplayTask extends TaskVo {
  /** Wire stage (contracts/tasks.md) — e.g. "applying". */
  stage?: string;
  /** Capabilities drive Retry/Cancel/Restore button visibility. */
  capabilities?: TaskCapabilities;
  /** Relations expose parent/root and link to changeSet / recoveryPoint. */
  relations?: TaskRelations;
  /** Final result, present once the task reaches a terminal state. */
  result?: TaskResult | null;
}

interface TaskDetailContentProps {
  task: DisplayTask;
  onRetry: () => void;
  onCancel: () => void;
  retryPending?: boolean;
  cancelPending?: boolean;
  /** Optional restore handler — surfaced only when canRestore is true. */
  onRestore?: () => void;
  restorePending?: boolean;
}

/** Link to a related audit/change-set/recovery resource. */
function RelationLink({
  changeSetId,
  recoveryPointId,
}: {
  changeSetId?: string;
  recoveryPointId?: string;
}) {
  const navigate = useNavigate();
  if (!changeSetId && !recoveryPointId) return <>-</>;
  return (
    <Flex gap={8} wrap>
      {changeSetId && (
        <Typography.Link
          onClick={() =>
            navigate({
              to: "/dashboard/tasks",
              search: { changeSetId } as never,
            })
          }
        >
          <LinkOutlined /> 变更集 {changeSetId.slice(0, 8)}
        </Typography.Link>
      )}
      {recoveryPointId && (
        <Typography.Link
          onClick={() =>
            navigate({
              to: "/dashboard/tasks",
              search: { recoveryPointId } as never,
            })
          }
        >
          <LinkOutlined /> 恢复点 {recoveryPointId.slice(0, 8)}
        </Typography.Link>
      )}
    </Flex>
  );
}

export function TaskDetailContent({
  task,
  onRetry,
  onCancel,
  retryPending,
  cancelPending,
  onRestore,
  restorePending,
}: TaskDetailContentProps) {
  const { token } = theme.useToken();
  const status = statusMap[task.status] ?? { label: task.status };
  // Normalize legacy `success` and wire `succeeded` without tripping TS literal
  // narrowing (TaskVo.status is the legacy enum; newer payloads may use either).
  const rawStatus: string = task.status;
  const isSucceeded = rawStatus === "success" || rawStatus === "succeeded";
  const job = task.jobDetail;
  const caps = task.capabilities;

  // Capabilities take precedence when present (new wire contract). Otherwise
  // fall back to legacy status-based visibility so the existing test passes.
  const canRetry = caps?.canRetry ?? task.status === "failed";
  const canCancel =
    caps?.canCancel ?? (task.status === "pending" || task.status === "running");
  const canRestore = caps?.canRestore ?? false;

  const relations = task.relations;
  const result = task.result;

  const detailColumns = [
    {
      dataIndex: "id",
      title: "任务 ID",
      render: () => (
        <Typography.Text code copyable>
          {task.id}
        </Typography.Text>
      ),
    },
    {
      dataIndex: "taskType",
      title: "任务类型",
      render: () => taskTypeMap[task.taskType] ?? task.taskType,
    },
    {
      dataIndex: "queueName",
      title: "队列",
      render: () => task.queueName ?? "-",
    },
    { dataIndex: "sourceType", title: "源类型" },
    {
      dataIndex: "sourceId",
      title: "源 ID",
      render: () => <Typography.Text code>{task.sourceId || "-"}</Typography.Text>,
    },
    ...(task.stage
      ? [{ dataIndex: "stage" as const, title: "阶段", render: () => task.stage }]
      : []),
    {
      dataIndex: "attemptsMade",
      title: "重试次数",
      render: () => job?.attemptsMade ?? task.attemptsMade,
    },
    {
      dataIndex: "createdAt",
      title: "创建时间",
      render: () => dtf.format(new Date(task.createdAt)),
    },
    {
      dataIndex: "startedAt",
      title: "开始时间",
      render: () => dtf.format(new Date(task.startedAt)),
    },
    ...((job?.processedOn ?? task.processedOn)
      ? [
          {
            dataIndex: "processedOn" as const,
            title: "处理时间",
            render: () =>
              dtf.format(new Date((job?.processedOn ?? task.processedOn)!)),
          },
        ]
      : []),
    ...((job?.finishedOn ?? task.finishedAt)
      ? [
          {
            dataIndex: "finishedOn" as const,
            title: "完成时间",
            render: () =>
              dtf.format(new Date((job?.finishedOn ?? task.finishedAt)!)),
          },
        ]
      : []),
  ];

  // Progress message prefers the wire progress.message, falls back to currentStep.
  const progressMessage =
    task.stage ??
    (task.progress != null && task.currentStep
      ? task.currentStep
      : undefined);

  return (
    <Flex vertical gap={token.marginMD}>
      <Flex wrap align="center" gap={token.marginSM}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {taskTypeMap[task.taskType] ?? task.taskType}
        </Typography.Title>
        <Tag color={status.color}>{status.label}</Tag>
        {task.stage && <Tag color="processing">{task.stage}</Tag>}
        {job && <Tag>BullMQ: {job.state}</Tag>}
      </Flex>

      <Card title="概览">
        <ProDescriptions
          column={{ xs: 1, sm: 2 }}
          dataSource={task}
          columns={detailColumns}
        />
      </Card>

      <Card title="执行状态">
        <Flex vertical gap={token.marginMD}>
          <Progress
            percent={isSucceeded ? 100 : task.progress}
            status={
              task.status === "failed"
                ? "exception"
                : isSucceeded
                  ? "success"
                  : "active"
            }
            format={(percent) =>
              progressMessage ? `${progressMessage} · ${percent}%` : `${percent}%`
            }
          />
          <ProDescriptions
            column={{ xs: 2, sm: 4 }}
            dataSource={task}
            columns={[
              { dataIndex: "importedCount", title: "导入" },
              { dataIndex: "addedCount", title: "新增" },
              { dataIndex: "updatedCount", title: "更新" },
              { dataIndex: "removedCount", title: "删除" },
            ]}
          />
          {result?.summary && (
            <Typography.Text type="secondary">{result.summary}</Typography.Text>
          )}
          {result?.counts && Object.keys(result.counts).length > 0 && (
            <Flex wrap gap={token.marginXS}>
              {Object.entries(result.counts).map(([k, v]) => (
                <Tag key={k}>
                  {k}: {v}
                </Tag>
              ))}
            </Flex>
          )}
        </Flex>
      </Card>

      {(relations || result?.links) && (
        <Card title="关联">
          <ProDescriptions
            column={{ xs: 1, sm: 2 }}
            dataSource={task}
            columns={[
              ...(relations?.parentTaskId
                ? [
                    {
                      dataIndex: "parentTaskId" as const,
                      title: "父任务",
                      render: () => (
                        <Link
                          to="/dashboard/tasks/$taskId"
                          params={{ taskId: relations.parentTaskId! }}
                        >
                          <Typography.Link>
                            {relations.parentTaskId!.slice(0, 8)}
                          </Typography.Link>
                        </Link>
                      ),
                    },
                  ]
                : []),
              ...(relations?.rootTaskId
                ? [
                    {
                      dataIndex: "rootTaskId" as const,
                      title: "根任务",
                      render: () => (
                        <Link
                          to="/dashboard/tasks/$taskId"
                          params={{ taskId: relations.rootTaskId! }}
                        >
                          <Typography.Link>
                            {relations.rootTaskId!.slice(0, 8)}
                          </Typography.Link>
                        </Link>
                      ),
                    },
                  ]
                : []),
              {
                dataIndex: "changeSetId",
                title: "变更集",
                render: () => (
                  <RelationLink
                    changeSetId={
                      relations?.changeSetId ?? result?.links?.changeSetId
                    }
                    recoveryPointId={
                      relations?.recoveryPointId ??
                      result?.links?.recoveryPointId
                    }
                  />
                ),
              },
            ]}
          />
        </Card>
      )}

      {task.error && (
        <Alert
          type="error"
          showIcon
          title="任务执行失败"
          description={
            <Flex vertical gap={token.marginSM}>
              <Typography.Paragraph
                style={{ whiteSpace: "pre-wrap", margin: 0 }}
              >
                {task.error}
              </Typography.Paragraph>
              {job?.stacktrace && job.stacktrace.length > 0 && (
                <details>
                  <summary style={{ cursor: "pointer" }}>查看堆栈跟踪</summary>
                  <Typography.Paragraph
                    code
                    copyable
                    style={{
                      whiteSpace: "pre-wrap",
                      marginTop: token.marginXS,
                    }}
                  >
                    {job.stacktrace.join("\n")}
                  </Typography.Paragraph>
                </details>
              )}
            </Flex>
          }
        />
      )}

      {!job?.jobAvailable && !isSucceeded && (
          <Alert
            type="warning"
            showIcon
            title="实时状态不可用"
            description="BullMQ job 已清理，无法获取实时状态。"
          />
        )}

      {/* Capabilities-driven action row. When capabilities are present the
          server is authoritative; otherwise we fall back to status-based
          visibility so legacy rows still render. */}
      <Flex gap={token.marginXS}>
        {canRetry && (
          <Button
            type="primary"
            onClick={onRetry}
            loading={retryPending}
            icon={<ReloadOutlined />}
          >
            重试
          </Button>
        )}
        {canCancel && (
          <Button
            danger
            onClick={onCancel}
            loading={cancelPending}
            icon={<CloseOutlined />}
          >
            取消
          </Button>
        )}
        {canRestore && onRestore && (
          <Button
            onClick={onRestore}
            loading={restorePending}
            icon={<ReloadOutlined />}
          >
            恢复
          </Button>
        )}
      </Flex>
    </Flex>
  );
}

export { statusMap, taskTypeMap, dtf };

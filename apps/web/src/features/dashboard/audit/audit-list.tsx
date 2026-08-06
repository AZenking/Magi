/**
 * AuditList (T107).
 *
 * Paginated, filterable audit-event list (GET /audit-events). Each row shows
 * occurredAt, action, displayName, result tag, and reason. Clicking a row
 * opens a drawer with summary, taskId/changeSetId/recoveryPointId links.
 *
 * Filter dimensions (action, result, targetType, time range) live in the
 * ProTable built-in QueryFilter (columns declare valueType/valueEnum). When an
 * event has a recoveryPointId the detail panel offers a recovery_restore entry
 * that opens the OperationPreview flow.
 *
 * antd v6 visual language (T001): token-only colors, 4px grid spacing, single
 * primary action. PageStack/PageHeader layout.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ProColumns } from "@ant-design/pro-components";
import { ProDescriptions } from "@ant-design/pro-components";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTOR_LABELS,
  AUDIT_RESULT_META,
} from "./audit-meta";
import type { AuditEventVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";
import {
  Button,
  Drawer,
  Empty,
  Grid,
  Space,
  Tag,
  Typography,
  theme,
} from "antd";
import { ReloadOutlined, UndoOutlined } from "@ant-design/icons";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import { PageHeader, PageStack } from "@/components/page-layout";
import { OperationPreview } from "@/features/dashboard/operations/operation-preview";
import { usePreparePreview } from "@/features/dashboard/operations/operation-queries";

interface Envelope<T> {
  success: boolean;
  data: T;
}

const RESULT_VALUE_ENUM = {
  accepted: { text: "已受理" },
  succeeded: { text: "成功" },
  failed: { text: "失败" },
  skipped: { text: "跳过" },
  cancelled: { text: "取消" },
};

const TARGET_TYPE_VALUE_ENUM = {
  source: { text: "数据源" },
  channel: { text: "频道" },
  stream: { text: "流地址" },
  task: { text: "任务" },
  backup: { text: "备份" },
  schedule: { text: "调度" },
  operation: { text: "操作" },
  change_set: { text: "变更集" },
  channel_batch: { text: "频道批次" },
  stream_collection: { text: "流集合" },
  device_client: { text: "设备客户端" },
  oauth_client: { text: "OAuth 客户端" },
};

const ACTION_VALUE_ENUM = Object.fromEntries(
  Object.entries(AUDIT_ACTION_LABELS).map(([value, text]) => [value, { text }]),
);

function formatDatetime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AuditList() {
  const screens = Grid.useBreakpoint();
  const { message } = useFeedback();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [resultFilter, setResultFilter] = useState<string>("");
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recoveryChangeSetId, setRecoveryChangeSetId] = useState<string | null>(
    null,
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "audit-events",
      page,
      pageSize,
      actionFilter,
      resultFilter,
      targetTypeFilter,
      from,
      to,
    ],
    queryFn: () => {
      const params: Record<string, string | number | undefined> = {
        page,
        pageSize,
        action: actionFilter || undefined,
        result: resultFilter || undefined,
        targetType: targetTypeFilter || undefined,
        from: from || undefined,
        to: to || undefined,
      };
      return apiClient<Envelope<PaginatedResponse<AuditEventVo>>>(
        "/audit-events",
        { params },
      );
    },
  });

  const events = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["audit-events"] });
  }, [qc]);

  const { data: drawerData } = useQuery({
    queryKey: ["audit-event", selectedId],
    queryFn: () =>
      apiClient<Envelope<AuditEventVo>>(`/audit-events/${selectedId}`),
    enabled: !!selectedId,
  });
  const drawerEvent = drawerData?.data;

  const preparePreview = usePreparePreview();
  const handleRecoveryRestore = async (recoveryPointId: string) => {
    try {
      const result = await preparePreview.mutateAsync({
        kind: "recovery_restore",
        scope: { type: "global", id: recoveryPointId },
        parameters: { recoveryPointId },
        expectedVersions: {},
      });
      setRecoveryChangeSetId(result.changeSet.id);
    } catch (err) {
      message.error(
        `准备恢复失败：${err instanceof Error ? err.message : "请稍后重试"}`,
      );
    }
  };

  const columns = useMemo<ProColumns<AuditEventVo>[]>(() => {
    const list: ProColumns<AuditEventVo>[] = [
      {
        dataIndex: "occurredAt",
        title: "时间",
        width: 180,
        search: false,
        render: (_, record) => formatDatetime(record.occurredAt),
      },
      {
        dataIndex: "action",
        title: "动作",
        width: 160,
        valueType: "select",
        valueEnum: ACTION_VALUE_ENUM,
        render: (_, record) => (
          <Tag>{AUDIT_ACTION_LABELS[record.action] ?? record.action}</Tag>
        ),
      },
      {
        dataIndex: "displayName",
        title: "目标",
        search: false,
        ellipsis: true,
        render: (_, record) => {
          const name = record.displayName;
          return (
            name ?? (
              <Typography.Text type="secondary">
                {record.targetType}:{record.targetId.slice(0, 8)}
              </Typography.Text>
            )
          );
        },
      },
      {
        dataIndex: "targetType",
        title: "目标类型",
        valueType: "select",
        valueEnum: TARGET_TYPE_VALUE_ENUM,
        hideInTable: true,
      },
      {
        dataIndex: "actorType",
        title: "发起方",
        width: 100,
        search: false,
        render: (_, record) =>
          AUDIT_ACTOR_LABELS[record.actorType] ?? record.actorType,
      },
      {
        dataIndex: "result",
        title: "结果",
        width: 100,
        valueType: "select",
        valueEnum: RESULT_VALUE_ENUM,
        render: (_, record) => {
          const meta = AUDIT_RESULT_META[record.result];
          return meta ? (
            <Tag color={meta.color}>{meta.label}</Tag>
          ) : (
            <Tag>{record.result}</Tag>
          );
        },
      },
      {
        dataIndex: "reason",
        title: "原因",
        search: false,
        ellipsis: true,
        render: (_, record) => {
          const reason = record.reason;
          return reason ? (
            <Typography.Text type="secondary" ellipsis={{ tooltip: reason }}>{reason}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          );
        },
      },
      // Virtual column: date range drives the `from`/`to` query params. Lives
      // only in the search form (hidden from the table).
      {
        dataIndex: "dateRange",
        title: "时间范围",
        valueType: "dateRange",
        hideInTable: true,
        search: {
          transform: (value) => ({
            from: Array.isArray(value) ? value[0] : value,
            to: Array.isArray(value) ? value[1] : value,
          }),
        },
      },
    ];
    return list;
  }, []);

  // ProTable's QueryFilter submit/reset routes here. Map the form values to
  // the existing filter state variables so the useQuery picks them up.
  const handleSearch = useCallback(
    (params: Record<string, unknown>) => {
      setActionFilter((params.action as string) ?? "");
      setResultFilter((params.result as string) ?? "");
      setTargetTypeFilter((params.targetType as string) ?? "");
      setFrom((params.from as string) ?? "");
      setTo((params.to as string) ?? "");
      setPage(1);
    },
    [],
  );

  return (
    <PageStack>
      <PageHeader
        title="审计日志"
        description="追溯每个高风险操作的发起方、影响与恢复点"
      />

      <ProTableWrapper<AuditEventVo>
        columns={columns}
        dataSource={events}
        rowKey="id"
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(record) => setSelectedId(record.id)}
        columnsStateKey="audit-events-columns"
        search={true}
        onSearch={handleSearch}
        toolBarRender={() => [
          <Button
            key="refresh"
            icon={<ReloadOutlined />}
            onClick={refresh}
            aria-label="刷新"
          >
            刷新
          </Button>,
        ]}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          },
        }}
      />

      <Drawer
        placement="right"
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title="审计事件详情"
        size={screens.sm ? 520 : "100%"}
        destroyOnHidden
        loading={!!selectedId && !drawerEvent}
      >
        {drawerEvent && (
          <AuditEventDetail
            event={drawerEvent}
            onGoTask={(taskId) =>
              navigate({
                to: "/dashboard/tasks/$taskId",
                params: { taskId },
              })
            }
            onRecoveryRestore={handleRecoveryRestore}
            recoveryPending={preparePreview.isPending}
          />
        )}
      </Drawer>

      {recoveryChangeSetId && (
        <Drawer
          placement="right"
          open={!!recoveryChangeSetId}
          onClose={() => setRecoveryChangeSetId(null)}
          title="恢复点恢复"
          size={screens.sm ? 720 : "100%"}
          destroyOnHidden
        >
          <OperationPreview
            changeSetId={recoveryChangeSetId}
            onClose={() => {
              setRecoveryChangeSetId(null);
              refresh();
            }}
            onApplied={() => {
              message.success("恢复任务已提交");
            }}
          />
        </Drawer>
      )}
    </PageStack>
  );
}

function AuditEventDetail({
  event,
  onGoTask,
  onRecoveryRestore,
  recoveryPending,
}: {
  event: AuditEventVo;
  onGoTask: (taskId: string) => void;
  onRecoveryRestore: (recoveryPointId: string) => void;
  recoveryPending: boolean;
}) {
  const { token } = theme.useToken();
  const summaryEntries = Object.entries(event.summary ?? {});

  return (
    <Space orientation="vertical" size={token.marginMD} style={{ width: "100%" }}>
      <ProDescriptions
        column={1}
        size="small"
        bordered
        dataSource={event}
        columns={[
          {
            dataIndex: "occurredAt",
            title: "时间",
            render: (_, entity) => formatDatetime(entity.occurredAt),
          },
          {
            dataIndex: "action",
            title: "动作",
            render: (_, entity) => (
              <Tag>{AUDIT_ACTION_LABELS[entity.action] ?? entity.action}</Tag>
            ),
          },
          {
            dataIndex: "actorType",
            title: "发起方",
            render: (_, entity) =>
              `${AUDIT_ACTOR_LABELS[entity.actorType] ?? entity.actorType} (${entity.actorId})`,
          },
          {
            dataIndex: "targetId",
            title: "目标",
            render: (_, entity) =>
              `${entity.targetType}:${entity.targetId}${
                entity.displayName ? ` (${entity.displayName})` : ""
              }`,
          },
          {
            dataIndex: "result",
            title: "结果",
            render: (_, entity) => {
              const meta = AUDIT_RESULT_META[entity.result];
              return meta ? (
                <Tag color={meta.color}>{meta.label}</Tag>
              ) : (
                <Tag>{entity.result}</Tag>
              );
            },
          },
          {
            dataIndex: "reason",
            title: "原因",
            render: (_, entity) => entity.reason ?? "—",
          },
          {
            dataIndex: "requestId",
            title: "Request ID",
            render: (_, entity) => entity.requestId ?? "—",
          },
        ]}
      />

      <Typography.Title level={5}>摘要</Typography.Title>
      {summaryEntries.length === 0 ? (
        <Empty description="无摘要数据" />
      ) : (
        <Space orientation="vertical" size={token.marginXS} style={{ width: "100%" }}>
          {summaryEntries.map(([k, v]) => (
            <Space
              key={k}
              style={{
                justifyContent: "space-between",
                width: "100%",
                padding: `${token.paddingXS}px ${token.paddingSM}px`,
                borderRadius: token.borderRadius,
                background: token.colorFillQuaternary,
              }}
            >
              <Typography.Text type="secondary">{k}</Typography.Text>
              <Typography.Text code>{formatSummaryValue(v)}</Typography.Text>
            </Space>
          ))}
        </Space>
      )}

      <Typography.Title level={5}>关联</Typography.Title>
      <Space orientation="vertical" size={token.marginXS} style={{ width: "100%" }}>
        {event.taskId && (
          <LinkRow label="任务" value={event.taskId} onOpen={() => onGoTask(event.taskId!)} />
        )}
        {event.parentTaskId && (
          <LinkRow
            label="父任务"
            value={event.parentTaskId}
            onOpen={() => onGoTask(event.parentTaskId!)}
          />
        )}
        {event.changeSetId && (
          <Typography.Text type="secondary">
            变更集：{event.changeSetId}
          </Typography.Text>
        )}
        {event.recoveryPointId && (
          <Space
            style={{
              justifyContent: "space-between",
              width: "100%",
              padding: `${token.paddingXS}px ${token.paddingSM}px`,
              borderRadius: token.borderRadius,
              background: token.colorFillQuaternary,
            }}
          >
            <Space orientation="vertical" size={0}>
              <Typography.Text type="secondary">恢复点</Typography.Text>
              <Typography.Text code style={{ fontSize: token.fontSizeSM }}>
                {event.recoveryPointId}
              </Typography.Text>
            </Space>
            <Button
              type="primary"
              size="small"
              icon={<UndoOutlined />}
              loading={recoveryPending}
              onClick={() => onRecoveryRestore(event.recoveryPointId!)}
            >
              恢复
            </Button>
          </Space>
        )}
        {!event.taskId &&
          !event.parentTaskId &&
          !event.changeSetId &&
          !event.recoveryPointId && (
            <Typography.Text type="secondary">无关联记录</Typography.Text>
          )}
      </Space>
    </Space>
  );
}

function LinkRow({
  label,
  value,
  onOpen,
}: {
  label: string;
  value: string;
  onOpen: () => void;
}) {
  const { token } = theme.useToken();
  return (
    <Space
      style={{
        justifyContent: "space-between",
        width: "100%",
        padding: `${token.paddingXS}px ${token.paddingSM}px`,
        borderRadius: token.borderRadius,
        background: token.colorFillQuaternary,
      }}
    >
      <Space orientation="vertical" size={0}>
        <Typography.Text type="secondary">{label}</Typography.Text>
        <Typography.Text code style={{ fontSize: token.fontSizeSM }}>
          {value}
        </Typography.Text>
      </Space>
      <Button type="link" size="small" onClick={onOpen}>
        打开
      </Button>
    </Space>
  );
}

function formatSummaryValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

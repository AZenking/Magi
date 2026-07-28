/**
 * AuditList (T107).
 *
 * Paginated, filterable audit-event list (GET /audit-events). Each row shows
 * occurredAt, action, displayName, result tag, and reason. Clicking a row
 * opens a drawer with summary, taskId/changeSetId/recoveryPointId links.
 *
 * Filter dimensions: action, result, targetType (antd Select) and time range
 * (DatePicker.RangePicker). When an event has a recoveryPointId the detail
 * panel offers a recovery_restore entry that opens the OperationPreview flow.
 *
 * antd v6 visual language (T001): token-only colors, 4px grid spacing, single
 * primary action. PageStack/PageHeader/FilterBar layout.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ProColumns } from "@ant-design/pro-components";
import type { Dayjs } from "dayjs";
import {
  AUDIT_ACTOR_LABELS,
  AUDIT_RESULT_META,
} from "./audit-meta";
import type { AuditEventVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";
import {
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Grid,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme,
} from "antd";
import { ReloadOutlined, UndoOutlined } from "@ant-design/icons";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import { FilterBar, PageHeader, PageStack } from "@/components/page-layout";
import { OperationPreview } from "@/features/dashboard/operations/operation-preview";
import { usePreparePreview } from "@/features/dashboard/operations/operation-queries";

const { RangePicker } = DatePicker;

interface Envelope<T> {
  success: boolean;
  data: T;
}

const RESULT_OPTIONS = [
  { value: "accepted", label: "已受理" },
  { value: "succeeded", label: "成功" },
  { value: "failed", label: "失败" },
  { value: "skipped", label: "跳过" },
  { value: "cancelled", label: "取消" },
];

function formatDatetime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AuditList() {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const { message } = useFeedback();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [resultFilter, setResultFilter] = useState<string>("");
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>("");
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recoveryChangeSetId, setRecoveryChangeSetId] = useState<string | null>(
    null,
  );

  const targetTypeOptions = useMemo(
    () => [
      { value: "source", label: "数据源" },
      { value: "channel", label: "频道" },
      { value: "backup", label: "备份" },
      { value: "schedule", label: "调度" },
      { value: "operation", label: "操作" },
    ],
    [],
  );

  const actionOptions = useMemo(
    () => [
      { value: "source.sync", label: "源同步" },
      { value: "source.delete", label: "源删除" },
      { value: "epg.match", label: "EPG 匹配" },
      { value: "channel.lifecycle", label: "频道生命周期" },
      { value: "channel.purge", label: "频道清理" },
      { value: "backup.create", label: "创建备份" },
      { value: "backup.restore", label: "恢复备份" },
      { value: "recovery.restore", label: "恢复点恢复" },
    ],
    [],
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "audit-events",
      page,
      pageSize,
      actionFilter,
      resultFilter,
      targetTypeFilter,
      range?.[0]?.toISOString(),
      range?.[1]?.toISOString(),
    ],
    queryFn: () => {
      const params: Record<string, string | number | undefined> = {
        page,
        pageSize,
        action: actionFilter || undefined,
        result: resultFilter || undefined,
        targetType: targetTypeFilter || undefined,
        from: range?.[0]?.toISOString() ?? undefined,
        to: range?.[1]?.toISOString() ?? undefined,
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

  const columns = useMemo<ProColumns<AuditEventVo>[]>(
    () => [
      {
        dataIndex: "occurredAt",
        title: "时间",
        width: 180,
        render: (_, record) => formatDatetime(record.occurredAt),
      },
      {
        dataIndex: "action",
        title: "动作",
        width: 160,
        render: (_, record) => <Tag>{record.action}</Tag>,
      },
      {
        dataIndex: "displayName",
        title: "目标",
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
        dataIndex: "actorType",
        title: "发起方",
        width: 100,
        render: (_, record) =>
          AUDIT_ACTOR_LABELS[record.actorType] ?? record.actorType,
      },
      {
        dataIndex: "result",
        title: "结果",
        width: 100,
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
        render: (_, record) => {
          const reason = record.reason;
          return reason ? (
            <Tooltip title={reason}>
              <Typography.Text type="secondary">{reason}</Typography.Text>
            </Tooltip>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          );
        },
      },
    ],
    [],
  );

  const resetFilters = () => {
    setActionFilter("");
    setResultFilter("");
    setTargetTypeFilter("");
    setRange(null);
    setPage(1);
  };

  return (
    <PageStack>
      <PageHeader
        title="审计日志"
        description="追溯每个高风险操作的发起方、影响与恢复点"
        actions={
          <Button
            shape="circle"
            icon={<ReloadOutlined />}
            onClick={refresh}
            aria-label="刷新"
          />
        }
      />

      <FilterBar>
        <Select
          allowClear
          placeholder="动作"
          value={actionFilter || undefined}
          onChange={(v) => {
            setActionFilter(v ?? "");
            setPage(1);
          }}
          options={actionOptions}
          style={{ width: 180 }}
          aria-label="动作筛选"
        />
        <Select
          allowClear
          placeholder="结果"
          value={resultFilter || undefined}
          onChange={(v) => {
            setResultFilter(v ?? "");
            setPage(1);
          }}
          options={RESULT_OPTIONS}
          style={{ width: 140 }}
          aria-label="结果筛选"
        />
        <Select
          allowClear
          placeholder="目标类型"
          value={targetTypeFilter || undefined}
          onChange={(v) => {
            setTargetTypeFilter(v ?? "");
            setPage(1);
          }}
          options={targetTypeOptions}
          style={{ width: 160 }}
          aria-label="目标类型筛选"
        />
        <RangePicker
          showTime
          value={range as never}
          onChange={(value) => {
            setRange((value as [Dayjs | null, Dayjs | null] | null) ?? null);
            setPage(1);
          }}
          aria-label="时间范围"
        />
        {(actionFilter || resultFilter || targetTypeFilter || range) && (
          <Button onClick={resetFilters}>清除筛选</Button>
        )}
      </FilterBar>

      <ProTableWrapper<AuditEventVo>
        columns={columns}
        dataSource={events}
        rowKey="id"
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(record) => setSelectedId(record.id)}
        columnsStateKey="audit-events-columns"
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
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          { label: "时间", children: formatDatetime(event.occurredAt) },
          {
            label: "动作",
            children: <Tag>{event.action}</Tag>,
          },
          {
            label: "发起方",
            children: `${AUDIT_ACTOR_LABELS[event.actorType] ?? event.actorType} (${event.actorId})`,
          },
          {
            label: "目标",
            children: `${event.targetType}:${event.targetId}${
              event.displayName ? ` (${event.displayName})` : ""
            }`,
          },
          {
            label: "结果",
            children: (() => {
              const meta = AUDIT_RESULT_META[event.result];
              return meta ? (
                <Tag color={meta.color}>{meta.label}</Tag>
              ) : (
                <Tag>{event.result}</Tag>
              );
            })(),
          },
          {
            label: "原因",
            children: event.reason ?? "—",
          },
          {
            label: "Request ID",
            children: event.requestId ?? "—",
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

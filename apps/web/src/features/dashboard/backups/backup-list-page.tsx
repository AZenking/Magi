/**
 * BackupListPage (T106).
 *
 * Paginated backup list (GET /backups), create backup (POST /backups with
 * Idempotency-Key), download (GET /backups/:id/download) and restore entry
 * via the BackupRestore panel (GET /backups/:id/restore-preflight →
 * backup_restore operation preview).
 *
 * antd v6 visual language (T001): token-only colors, 4px grid spacing, single
 * primary action per surface. PageStack/PageHeader/FilterBar layout.
 */
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProColumns } from "@ant-design/pro-components";
import type { ConfigBackupVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { API_BASE } from "@/services/config";
import { useFeedback } from "@/lib/feedback";
import { Button, Space, Tag, Tooltip, Typography, theme } from "antd";
import {
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import { FilterBar, PageHeader, PageStack } from "@/components/page-layout";
import { BackupRestore } from "./backup-restore";

interface Envelope<T> {
  success: boolean;
  data: T;
}

const STATUS_META: Record<
  ConfigBackupVo["status"],
  { label: string; color: string }
> = {
  creating: { label: "生成中", color: "processing" },
  ready: { label: "可用", color: "success" },
  failed: { label: "失败", color: "error" },
  expired: { label: "已过期", color: "default" },
};

function formatDatetime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function BackupListPage() {
  const { token } = theme.useToken();
  const { message, notification } = useFeedback();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [restoreId, setRestoreId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["backups", page, pageSize],
    queryFn: () =>
      apiClient<Envelope<PaginatedResponse<ConfigBackupVo>>>("/backups", {
        params: { page, pageSize },
      }),
    // creating backups transition to ready asynchronously; poll until none pending.
    refetchInterval: (query) => {
      const items = query.state.data?.data?.items;
      return items?.some((b) => b.status === "creating") ? 4000 : false;
    },
  });

  const backups = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["backups"] });
  }, [qc]);

  const createMutation = useMutation({
    mutationFn: async () => {
      // Idempotency-Key allows safe retry (contracts/backups.md).
      const idempotencyKey = crypto.randomUUID();
      return apiClient<
        Envelope<{
          backupId: string;
          taskId: string;
        }>
      >("/backups", {
        method: "POST",
        body: {
          scope: {
            sources: true,
            canonicalChannels: true,
            epgBindings: true,
            streams: true,
            schedules: true,
            policies: true,
          },
        },
        headers: { "Idempotency-Key": idempotencyKey },
      });
    },
    onSuccess: (res) => {
      message.success("已提交备份生成任务");
      refresh();
      if (res.data?.taskId) {
        notification.success({
          title: "备份任务已创建",
          description: "生成中，列表会自动刷新。",
        });
      }
    },
    onError: (err) => {
      message.error(
        `备份失败：${err instanceof Error ? err.message : "请稍后重试"}`,
      );
    },
  });

  const columns = useMemo<ProColumns<ConfigBackupVo>[]>(
    () => [
      {
        dataIndex: "status",
        title: "状态",
        width: 100,
        render: (_, record) => {
          const meta = STATUS_META[record.status];
          return <Tag color={meta.color}>{meta.label}</Tag>;
        },
      },
      {
        dataIndex: "formatVersion",
        title: "格式版本",
        width: 100,
        render: (_, record) => record.formatVersion,
      },
      {
        dataIndex: "objectCounts",
        title: "对象计数",
        render: (_, record) => {
          const entries = Object.entries(record.objectCounts ?? {});
          if (entries.length === 0)
            return <Typography.Text type="secondary">—</Typography.Text>;
          return (
            <Space size={token.marginXS} wrap>
              {entries.map(([k, v]) => (
                <Tag key={k}>
                  {k}: {v}
                </Tag>
              ))}
            </Space>
          );
        },
      },
      {
        dataIndex: "checksum",
        title: "校验和",
        width: 180,
        render: (_, record) => {
          const checksum = record.checksum;
          return checksum ? (
            <Tooltip title={checksum}>
              <Typography.Text code style={{ fontSize: token.fontSizeSM }}>
                {checksum.length > 16 ? `${checksum.slice(0, 16)}…` : checksum}
              </Typography.Text>
            </Tooltip>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          );
        },
      },
      {
        dataIndex: "createdAt",
        title: "创建时间",
        width: 180,
        render: (_, record) => formatDatetime(record.createdAt),
      },
      {
        dataIndex: "expiresAt",
        title: "过期时间",
        width: 180,
        render: (_, record) => formatDatetime(record.expiresAt),
      },
      {
        key: "actions",
        title: "操作",
        valueType: "option",
        hideInSetting: true,
        fixed: "right",
        width: 220,
        render: (_, record) => {
          const canDownload = record.canDownload && record.status === "ready";
          const canRestore = record.status === "ready";
          return (
            <Space size={token.marginXS}>
              <Tooltip
                title={canDownload ? undefined : "备份未就绪或无下载权限"}
              >
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  disabled={!canDownload}
                  href={`${API_BASE}/backups/${record.id}/download`}
                >
                  下载
                </Button>
              </Tooltip>
              <Tooltip title={canRestore ? undefined : "仅就绪备份可恢复"}>
                <Button
                  size="small"
                  icon={<UndoOutlined />}
                  disabled={!canRestore}
                  onClick={() => setRestoreId(record.id)}
                >
                  恢复
                </Button>
              </Tooltip>
            </Space>
          );
        },
      },
    ],
    [token],
  );

  return (
    <PageStack>
      <PageHeader
        title="备份管理"
        description="创建配置快照，下载或恢复到任意就绪备份"
        actions={
          <Space size={token.marginSM} wrap>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              创建备份
            </Button>
            <Button
              shape="circle"
              icon={<ReloadOutlined />}
              onClick={refresh}
              aria-label="刷新"
            />
          </Space>
        }
      />

      <FilterBar>
        <Typography.Text type="secondary">
          保留期默认 30 天，可由部署配置延长。
        </Typography.Text>
      </FilterBar>

      <ProTableWrapper<ConfigBackupVo>
        columns={columns}
        dataSource={backups}
        rowKey="id"
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        columnsStateKey="backups-columns"
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

      <BackupRestore
        backupId={restoreId ?? ""}
        open={!!restoreId}
        onClose={() => setRestoreId(null)}
      />
    </PageStack>
  );
}

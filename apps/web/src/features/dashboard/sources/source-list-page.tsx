import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { SourceVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";
import { Button, Modal, Space, Typography } from "antd";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { getSourceColumns } from "@/features/dashboard/epg/columns";
import { SourceFormDialog } from "@/features/dashboard/epg/source-form-dialog";
import { PageHeader, PageStack } from "@/components/page-layout";
import { OperationPreview } from "@/features/dashboard/operations/operation-preview";
import { usePreparePreview } from "@/features/dashboard/operations/operation-queries";

const { Text } = Typography;

interface SourceListPageProps {
  type: "m3u" | "xmltv";
  title: string;
}

export function SourceListPage({ type, title }: SourceListPageProps) {
  const { message, notification } = useFeedback();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  // Server-side sort state (manual). ProTableWrapper's onSorterChange feeds
  // these so the query params (sortBy/sortDir) drive sorting.
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | undefined>(undefined);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<SourceVo | null>(null);
  // Safe Operations (T108): source delete goes preview → confirm → task.
  // The flow shows impact (channels/programmes/mappings/streams) plus the
  // reversible disable alternative before any irreversible change.
  const [deletingSource, setDeletingSource] = useState<SourceVo | null>(null);
  const [deleteChangeSetId, setDeleteChangeSetId] = useState<string | null>(null);
  const [deletePreviewKind, setDeletePreviewKind] = useState<
    "source_delete" | null
  >(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  // Safe Operations (T046): M3U sync goes preview → confirm → task.
  const [previewChangeSetId, setPreviewChangeSetId] = useState<string | null>(null);
  const preparePreview = usePreparePreview();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sources", type, search, page, pageSize, sortBy, sortDir],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<SourceVo> }>(
        "/sources",
        {
          params: {
            type,
            search: search || undefined,
            page,
            pageSize,
            sortBy,
            sortDir,
          },
        },
      ),
  });

  const sources = data?.data?.items ?? [];

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["sources"] });
  }, [queryClient]);

  const handleCreate = useCallback(
    async (formData: {
      name: string;
      url: string;
      enabled: boolean;
      priority?: number;
      allowFallback?: boolean;
      participateInOutput?: boolean;
    }) => {
      try {
        await apiClient("/sources", {
          method: "POST",
          body: { ...formData, type },
        });
        message.success("源添加成功");
        refresh();
      } catch (err) {
        message.error(
          `源添加失败：${err instanceof Error ? err.message : "请稍后重试"}`,
        );
        throw err;
      }
    },
    [type, refresh],
  );

  const handleUpdate = useCallback(
    async (formData: {
      name: string;
      url: string;
      enabled: boolean;
      priority?: number;
      allowFallback?: boolean;
      participateInOutput?: boolean;
    }) => {
      if (!editingSource) return;
      try {
        await apiClient(`/sources/${editingSource.type}/${editingSource.id}`, {
          method: "PUT",
          body: formData,
        });
        message.success("源更新成功");
        refresh();
      } catch (err) {
        message.error(
          `源更新失败：${err instanceof Error ? err.message : "请稍后重试"}`,
        );
        throw err;
      }
    },
    [editingSource, refresh],
  );

  // Safe Operations (T108): the delete button triggers a source_delete
  // preview that shows the impact (channels/programmes/mappings/streams) and
  // offers a reversible disable alternative. The actual delete happens via the
  // standard apply flow inside OperationPreview.
  const handleDelete = useCallback(
    async (source: SourceVo) => {
      setDeletingSource(source);
      try {
        const result = await preparePreview.mutateAsync({
          kind: "source_delete",
          scope: { type: "source", id: source.id },
          parameters: { sourceId: source.id },
          expectedVersions: {},
        });
        setDeletePreviewKind("source_delete");
        setDeleteChangeSetId(result.changeSet.id);
      } catch (err) {
        message.error(
          `准备删除预览失败：${err instanceof Error ? err.message : "请稍后重试"}`,
        );
        setDeletingSource(null);
      }
    },
    [preparePreview],
  );

  // Reversible alternative offered by the source_delete preview summary: flip
  // enabled=false via the normal update channel without any irreversible
  // change (contracts/operation-previews.md source_delete obligations).
  const handleDisableAlternative = useCallback(
    async (source: SourceVo) => {
      try {
        await apiClient(`/sources/${source.type}/${source.id}`, {
          method: "PUT",
          body: { enabled: false },
        });
        message.success("源已停用，可随时恢复");
        refresh();
        setDeletingSource(null);
      } catch (err) {
        message.error(
          `停用失败：${err instanceof Error ? err.message : "请稍后重试"}`,
        );
      }
    },
    [refresh],
  );

  const handleSync = useCallback(
    async (source: SourceVo) => {
      setSyncingId(source.id);
      try {
        if (type === "m3u") {
          // Preview → confirm → task (FR-001/FR-027): never mutate directly.
          // Loading stays scoped to this source row via syncingId.
          const result = await preparePreview.mutateAsync({
            kind: "m3u_sync",
            scope: { type: "source", id: source.id },
            parameters: { sourceId: source.id },
            expectedVersions: {},
          });
          setPreviewChangeSetId(result.changeSet.id);
          return;
        }
        const result = await apiClient<{
          success: boolean;
          data: { taskId: string };
        }>(`/sources/${source.type}/${source.id}/sync`, { method: "POST" });
        notification.success({
          title: "同步任务已提交",
          description: "任务已加入队列",
          actions: (
            <Button
              type="link"
              size="small"
              onClick={() =>
                navigate({
                  to: "/dashboard/tasks/$taskId",
                  params: { taskId: result.data.taskId },
                })
              }
            >
              查看任务
            </Button>
          ),
        });
        refresh();
      } catch (err) {
        message.error(
          `提交同步失败：${err instanceof Error ? err.message : "请稍后重试"}`,
        );
      } finally {
        setSyncingId(null);
      }
    },
    [refresh, navigate, type, preparePreview],
  );

  const handleCheck = useCallback(
    async (source: SourceVo) => {
      setCheckingId(source.id);
      try {
        const result = await apiClient<{
          success: boolean;
          data: { taskId: string };
        }>(`/sources/${source.type}/${source.id}/check`, { method: "POST" });
        notification.success({
          title: "源检测已提交",
          description: "检测中，可前往任务详情查看进度",
          actions: (
            <Button
              type="link"
              size="small"
              onClick={() =>
                navigate({
                  to: "/dashboard/tasks/$taskId",
                  params: { taskId: result.data.taskId },
                })
              }
            >
              查看任务
            </Button>
          ),
        });
        refresh();
      } catch (err) {
        message.error(
          `提交检测失败：${err instanceof Error ? err.message : "请稍后重试"}`,
        );
      } finally {
        setCheckingId(null);
      }
    },
    [refresh, navigate],
  );

  const columns = useMemo(
    () =>
      getSourceColumns({
        onEdit: (source) => {
          setEditingSource(source);
          setDialogOpen(true);
        },
        onDelete: (source) => void handleDelete(source),
        onSync: handleSync,
        onCheck: handleCheck,
        syncingId,
        checkingId,
        deletingId: deletingSource?.id ?? null,
      }),
    [handleSync, handleCheck, handleDelete, syncingId, checkingId, deletingSource],
  );

  // Controlled sort state mirrors the server-side sort so the column header
  // shows the active direction after a manual change.
  const sortState = useMemo<
    { field: string; order: "ascend" | "descend" } | null
  >(
    () =>
      sortBy && sortDir
        ? {
            field: sortBy,
            order: sortDir === "asc" ? "ascend" : "descend",
          }
        : null,
    [sortBy, sortDir],
  );

  const deleteTarget = deletingSource;

  // ProTable's QueryFilter submit/reset routes here. Map the form values to
  // the existing filter state variables so the useQuery picks them up.
  const handleSearch = useCallback((params: Record<string, unknown>) => {
    setSearch((params.search as string) ?? "");
    setPage(1);
  }, []);

  return (
    <PageStack>
      <PageHeader title={title} />

      <ProTableWrapper
        columns={columns}
        dataSource={sources}
        rowKey="id"
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        search={true}
        onSearch={handleSearch}
        toolBarRender={() => [
          <Button
            key="add"
            type="primary"
            onClick={() => {
              setEditingSource(null);
              setDialogOpen(true);
            }}
            icon={<PlusOutlined />}
          >
            添加源
          </Button>,
          <Button
            key="refresh"
            icon={<ReloadOutlined />}
            onClick={refresh}
            aria-label="刷新"
          >
            刷新
          </Button>,
        ]}
        sortState={sortState}
        onSorterChange={(field, order) => {
          setSortBy(field ?? undefined);
          setSortDir(order === "ascend" ? "asc" : order === "descend" ? "desc" : undefined);
          setPage(1);
        }}
        pagination={{
          current: page,
          pageSize,
          total: data?.data?.total ?? 0,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          },
        }}
        columnsStateKey="source-columns"
      />

      <SourceFormDialog
        key={editingSource?.id ?? "create"}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingSource(null);
        }}
        source={editingSource}
        sourceType={type}
        onSubmit={editingSource ? handleUpdate : handleCreate}
      />

      {deleteTarget && (
        <Modal
          open
          title="删除影响预览"
          onCancel={() => {
            setDeletingSource(null);
            setDeleteChangeSetId(null);
            setDeletePreviewKind(null);
          }}
          footer={
            <>
              <Button
                onClick={() => {
                  setDeletingSource(null);
                  setDeleteChangeSetId(null);
                  setDeletePreviewKind(null);
                }}
              >
                取消
              </Button>
              {/* Reversible alternative (contracts/operation-previews.md
                  source_delete): disable keeps the configuration intact and
                  stops sync/output participation; recoverable at any time. */}
              <Button
                onClick={() => void handleDisableAlternative(deleteTarget)}
                disabled={!deleteChangeSetId}
              >
                改为停用
              </Button>
            </>
          }
          destroyOnHidden
          width={880}
          mask={{ closable: false }}
        >
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Text>
              删除源「{deleteTarget.name}」前已计算对频道、节目、映射、线路与调度
              的影响。下方预览可安全浏览；「应用变更」后才会真正提交删除任务。
              如需可恢复的替代方案，请使用「改为停用」。
            </Text>
            {preparePreview.isPending && !deleteChangeSetId && (
              <Text type="secondary">正在计算影响范围…</Text>
            )}
            {deleteChangeSetId && deletePreviewKind === "source_delete" && (
              <OperationPreview
                changeSetId={deleteChangeSetId}
                onClose={() => {
                  setDeletingSource(null);
                  setDeleteChangeSetId(null);
                  setDeletePreviewKind(null);
                  refresh();
                }}
                onApplied={(taskId) => {
                  notification.success({
                    title: "删除任务已提交",
                    description: "应用任务执行中，完成后列表自动刷新",
                    actions: (
                      <Button
                        type="link"
                        size="small"
                        onClick={() =>
                          navigate({
                            to: "/dashboard/tasks/$taskId",
                            params: { taskId },
                          })
                        }
                      >
                        查看任务
                      </Button>
                    ),
                  });
                  setDeletingSource(null);
                  setDeleteChangeSetId(null);
                  setDeletePreviewKind(null);
                }}
              />
            )}
          </Space>
        </Modal>
      )}

      <Modal
        open={!!previewChangeSetId}
        title="同步影响预览"
        onCancel={() => setPreviewChangeSetId(null)}
        footer={null}
        width={880}
        mask={{ closable: false }}
        destroyOnHidden
      >
        {previewChangeSetId && (
          <OperationPreview
            changeSetId={previewChangeSetId}
            onClose={() => {
              setPreviewChangeSetId(null);
              refresh();
            }}
            onApplied={(taskId) => {
              notification.success({
                title: "变更已提交应用",
                description: "应用任务执行中，完成后列表自动刷新",
                actions: (
                  <Button
                    type="link"
                    size="small"
                    onClick={() =>
                      navigate({
                        to: "/dashboard/tasks/$taskId",
                        params: { taskId },
                      })
                    }
                  >
                    查看任务
                  </Button>
                ),
              });
            }}
          />
        )}
      </Modal>
    </PageStack>
  );
}

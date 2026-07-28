import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  useQuery,
  useQueryClient,
  useMutation,
} from "@tanstack/react-query";
import type { TaskVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button, Drawer, Grid, Select, Tabs } from "antd";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import { ReloadOutlined } from "@ant-design/icons";
import { getTaskColumns } from "@/features/dashboard/tasks/columns";
import { TaskDetailContent } from "@/features/dashboard/tasks/task-detail-content";
import { ScheduledTasksSection } from "@/features/dashboard/tasks/scheduled-tasks-section";
import {
  targetPendingRegistry,
  useTargetPending,
} from "@/features/dashboard/tasks/task-registry";
import { FilterBar, PageHeader, PageStack } from "@/components/page-layout";

export const Route = createFileRoute("/dashboard/tasks/")({
  component: TasksPage,
});

interface Envelope<T> {
  success: boolean;
  data: T;
}

/**
 * Derive a stable target ref for the row's pending badge. The legacy list
 * endpoint returns TaskVo (no explicit target pair); when source fields are
 * absent we degrade to the task id alone — still per-row, never cross-row.
 */
function rowTarget(task: TaskVo) {
  return {
    taskId: task.id,
    targetType: task.sourceType || "task",
    targetId: task.sourceId || task.id,
  };
}

function TasksPage() {
  const screens = Grid.useBreakpoint();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [queueFilter, setQueueFilter] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tasks", page, pageSize, statusFilter, queueFilter],
    queryFn: () =>
      apiClient<Envelope<PaginatedResponse<TaskVo>>>("/tasks", {
        params: {
          page,
          pageSize,
          status: statusFilter || undefined,
          queueName: queueFilter || undefined,
        },
      }),
    refetchInterval: (query) => {
      const items = query.state.data?.data?.items;
      if (items?.some((t) => t.status === "pending" || t.status === "running"))
        return 3000;
      return false;
    },
  });

  const tasks = data?.data?.items ?? [];

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }, [queryClient]);

  // Retry: per-target Idempotency-Key (contracts/tasks.md "Retry"). The key is
  // generated per click, then tracked in the registry so only this row shows
  // pending.
  const retryMutation = useMutation({
    mutationFn: async (task: TaskVo) => {
      targetPendingRegistry.start(rowTarget(task));
      return apiClient<
        Envelope<{ retried: boolean; newTaskId?: string }>
      >(`/tasks/${task.id}/retry`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
    },
    onSuccess: (res, task) => {
      targetPendingRegistry.stop(rowTarget(task));
      if (res.data?.newTaskId) {
        setSelectedTaskId(res.data.newTaskId);
      }
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
      refresh();
    },
    onError: (_err, task) => {
      targetPendingRegistry.stop(rowTarget(task));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (task: TaskVo) => {
      targetPendingRegistry.start(rowTarget(task));
      return apiClient<Envelope<boolean>>(`/tasks/${task.id}/cancel`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
    },
    onSuccess: (_data, task) => {
      targetPendingRegistry.stop(rowTarget(task));
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
      refresh();
    },
    onError: (_err, task) => {
      targetPendingRegistry.stop(rowTarget(task));
    },
  });

  const isRowPending = useTargetPending();

  const columns = useMemo(
    () =>
      getTaskColumns({
        onRetry: (task) => retryMutation.mutate(task),
        onCancel: (task) => cancelMutation.mutate(task),
        isPending: (task) => isRowPending(rowTarget(task)),
      }),
    [retryMutation, cancelMutation, isRowPending],
  );

  // Drawer task detail query
  const { data: drawerData } = useQuery({
    queryKey: ["task", selectedTaskId],
    queryFn: () =>
      apiClient<Envelope<TaskVo>>(`/tasks/${selectedTaskId}`),
    enabled: !!selectedTaskId,
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      if (task?.status === "pending" || task?.status === "running") return 3000;
      return false;
    },
  });

  const drawerTask = drawerData?.data;
  const drawerTarget = drawerTask ? rowTarget(drawerTask) : null;

  return (
    <PageStack>
      <PageHeader
        title="任务管理"
        actions={
          <Button
            shape="circle"
            icon={<ReloadOutlined />}
            onClick={refresh}
            aria-label="刷新"
          />
        }
      />

      <Tabs
        defaultActiveKey="history"
        items={[
          {
            key: "history",
            label: "历史任务",
            children: (
              <PageStack>
                <FilterBar>
                  <Select
                    value={statusFilter || "all"}
                    onChange={(v) => {
                      setStatusFilter(v === "all" ? "" : v);
                      setPage(1);
                    }}
                    aria-label="状态筛选"
                    options={[
                      { value: "all", label: "全部状态" },
                      { value: "pending", label: "等待中" },
                      { value: "running", label: "运行中" },
                      { value: "success", label: "成功" },
                      { value: "failed", label: "失败" },
                      { value: "cancelled", label: "已取消" },
                    ]}
                    style={{ width: 160 }}
                  />
                  <Select
                    value={queueFilter || "all"}
                    onChange={(v) => {
                      setQueueFilter(v === "all" ? "" : v);
                      setPage(1);
                    }}
                    aria-label="队列筛选"
                    options={[
                      { value: "all", label: "全部队列" },
                      { value: "source-sync", label: "源同步" },
                      { value: "epg", label: "EPG" },
                      { value: "health-check", label: "健康检查" },
                    ]}
                    style={{ width: 160 }}
                  />
                </FilterBar>
                <ProTableWrapper
                  columns={columns}
                  dataSource={tasks}
                  rowKey="id"
                  loading={isLoading}
                  error={error}
                  onRetry={() => void refetch()}
                  onRowClick={(task) => setSelectedTaskId(task.id)}
                  pagination={{
                    current: page,
                    pageSize,
                    total: data?.data?.total ?? 0,
                    onChange: (nextPage, nextPageSize) => {
                      setPage(nextPage);
                      setPageSize(nextPageSize);
                    },
                  }}
                  columnsStateKey="task-columns"
                />
              </PageStack>
            ),
          },
          {
            key: "scheduled",
            label: "定时任务",
            children: <ScheduledTasksSection />,
          },
        ]}
      />

      <Drawer
        placement="right"
        open={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        title="任务详情"
        size={screens.sm ? 480 : "100%"}
        destroyOnHidden
        loading={!!selectedTaskId && !drawerTask}
      >
        <div style={{ overflowY: "auto" }}>
          {drawerTask && (
            <TaskDetailContent
              task={drawerTask}
              onRetry={() =>
                selectedTaskId &&
                retryMutation.mutate({
                  ...drawerTask,
                  id: selectedTaskId,
                })
              }
              onCancel={() =>
                selectedTaskId &&
                cancelMutation.mutate({
                  ...drawerTask,
                  id: selectedTaskId,
                })
              }
              retryPending={
                !!drawerTarget && isRowPending(drawerTarget)
              }
              cancelPending={
                !!drawerTarget && isRowPending(drawerTarget)
              }
            />
          )}
        </div>
      </Drawer>
    </PageStack>
  );
}

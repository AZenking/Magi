import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import {
  useQuery,
  useQueryClient,
  useMutation,
} from "@tanstack/react-query";
import { ProList } from "@ant-design/pro-components";
import type { ProColumns } from "@ant-design/pro-components";
import type { TaskVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button, Drawer, Grid, Result, Tabs } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { TaskDetailContent } from "@/features/dashboard/tasks/task-detail-content";
import { ScheduledTasksSection } from "@/features/dashboard/tasks/scheduled-tasks-section";
import {
  taskActions,
  taskAvatar,
  taskContent,
  taskDescription,
  taskTitle,
} from "@/features/dashboard/tasks/task-list-item";
import { STATUS_VALUE_ENUM, QUEUE_NAME_VALUE_ENUM } from "@/features/dashboard/tasks/columns";
import {
  targetPendingRegistry,
  useTargetPending,
} from "@/features/dashboard/tasks/task-registry";
import { PageHeader, PageStack } from "@/components/page-layout";

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

  // ProList inherits ProTable's QueryFilter; these virtual columns drive the
  // search form (queue + status). They are hidden from the list body.
  const searchColumns: ProColumns<TaskVo>[] = [
    {
      title: "队列",
      dataIndex: "queueName",
      valueType: "select",
      valueEnum: QUEUE_NAME_VALUE_ENUM,
      hideInTable: true,
    },
    {
      title: "状态",
      dataIndex: "status",
      valueType: "select",
      valueEnum: STATUS_VALUE_ENUM,
      hideInTable: true,
    },
  ];

  const actionCtx = {
    onRetry: (task: TaskVo) => retryMutation.mutate(task),
    onCancel: (task: TaskVo) => cancelMutation.mutate(task),
    isPending: (task: TaskVo) => isRowPending(rowTarget(task)),
  };

  // ProTable's QueryFilter submit/reset routes here. Map the form values to
  // the existing filter state variables so the useQuery picks them up.
  const handleSearch = useCallback((params: Record<string, unknown>) => {
    setStatusFilter((params.status as string) ?? "");
    setQueueFilter((params.queueName as string) ?? "");
    setPage(1);
  }, []);

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
      <PageHeader title="任务管理" />

      <Tabs
        defaultActiveKey="history"
        items={[
          {
            key: "history",
            label: "历史任务",
            children: (
              <ProList<TaskVo>
                rowKey="id"
                dataSource={tasks}
                loading={isLoading}
                split
                columns={[
                  ...searchColumns,
                  {
                    title: "任务",
                    dataIndex: "taskType",
                    listSlot: "avatar",
                    render: (_, task) => taskAvatar(task),
                  },
                  {
                    title: "任务",
                    dataIndex: "taskType",
                    listSlot: "title",
                    search: false,
                    render: (_, task) => taskTitle(task),
                  },
                  {
                    title: "详情",
                    dataIndex: "sourceType",
                    listSlot: "description",
                    search: false,
                    render: (_, task) => taskDescription(task),
                  },
                  {
                    title: "进度",
                    dataIndex: "progress",
                    listSlot: "content",
                    search: false,
                    render: (_, task) => taskContent(task),
                  },
                  {
                    title: "操作",
                    dataIndex: "option",
                    valueType: "option",
                    listSlot: "actions",
                    search: false,
                    render: (_, task) => taskActions(task, actionCtx),
                  },
                ]}
                search={{ labelWidth: "auto", defaultCollapsed: false }}
                onSubmit={(params) => handleSearch(params as Record<string, unknown>)}
                onReset={() => handleSearch({})}
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
                locale={{
                  emptyText: error ? (
                    <Result
                      status="error"
                      title="任务列表加载失败"
                      extra={<Button onClick={() => void refetch()}>重试</Button>}
                    />
                  ) : undefined,
                }}
                onRow={(task: TaskVo) => ({
                  style: { cursor: "pointer" },
                  onClick: () => setSelectedTaskId(task.id),
                })}
                pagination={{
                  current: page,
                  pageSize,
                  total: data?.data?.total ?? 0,
                  onChange: (nextPage, nextPageSize) => {
                    setPage(nextPage);
                    setPageSize(nextPageSize);
                  },
                }}
              />
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

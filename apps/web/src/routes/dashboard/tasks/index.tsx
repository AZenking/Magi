import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { TaskVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button } from "@magi/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@magi/ui/components/select";
import { DataTable } from "@magi/ui/components/data-table";
import { DataTablePagination } from "@magi/ui/components/data-table-pagination";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@magi/ui/components/drawer";
import { RefreshCwIcon } from "lucide-react";
import { useReactTable, getCoreRowModel, type VisibilityState } from "@tanstack/react-table";
import { getTaskColumns } from "@/features/dashboard/tasks/columns";
import { TaskDetailContent } from "@/features/dashboard/tasks/task-detail-content";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@magi/ui/components/tabs";
import { ScheduledTasksSection } from "@/features/dashboard/tasks/scheduled-tasks-section";

export const Route = createFileRoute("/dashboard/tasks/")({
  component: TasksPage,
});

function TasksPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [queueFilter, setQueueFilter] = useState<string>("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", page, pageSize, statusFilter, queueFilter],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<TaskVo> }>("/tasks", {
        params: {
          page,
          pageSize,
          status: statusFilter || undefined,
          queueName: queueFilter || undefined,
        },
      }),
    refetchInterval: (query) => {
      const items = query.state.data?.data?.items;
      if (items?.some((t) => t.status === "pending" || t.status === "running")) return 3000;
      return false;
    },
  });

  const tasks = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 0;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }, [queryClient]);

  const retryMutation = useMutation({
    mutationFn: async (taskId: string) => {
      setRetryingId(taskId);
      return apiClient<{ success: boolean; data: { retried: boolean; newTaskId?: string } }>(`/tasks/${taskId}/retry`, { method: "POST" });
    },
    onSuccess: (res, taskId) => {
      setRetryingId(null);
      if (res.data?.newTaskId) {
        setSelectedTaskId(res.data.newTaskId);
      }
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      refresh();
    },
    onError: () => { setRetryingId(null); },
  });

  const cancelMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return apiClient<{ success: boolean; data: boolean }>(`/tasks/${taskId}/cancel`, { method: "POST" });
    },
    onSuccess: (_data, taskId) => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      refresh();
    },
  });

  const columns = useMemo(() => getTaskColumns({
    onRetry: (task) => retryMutation.mutate(task.id),
    onCancel: (task) => cancelMutation.mutate(task.id),
    retryingId,
  }), [retryMutation, cancelMutation, retryingId]);

  const table = useReactTable({
    data: tasks,
    columns,
    pageCount: totalPages,
    state: {
      columnVisibility,
      pagination: { pageIndex: page - 1, pageSize },
    },
    manualPagination: true,
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex: page - 1, pageSize })
          : updater;
      setPage(next.pageIndex + 1);
      setPageSize(next.pageSize);
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  // Drawer task detail query
  const { data: drawerData } = useQuery({
    queryKey: ["task", selectedTaskId],
    queryFn: () =>
      apiClient<{ success: boolean; data: TaskVo }>(`/tasks/${selectedTaskId}`),
    enabled: !!selectedTaskId,
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      if (task?.status === "pending" || task?.status === "running") return 3000;
      return false;
    },
  });

  const drawerTask = drawerData?.data;

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">任务管理</h1>
        <Button variant="outline" size="icon" onClick={refresh} aria-label="刷新">
          <RefreshCwIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">历史任务</TabsTrigger>
          <TabsTrigger value="scheduled">定时任务</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v === "all" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]" aria-label="状态筛选">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="pending">等待中</SelectItem>
                <SelectItem value="running">运行中</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={queueFilter}
              onValueChange={(v) => {
                setQueueFilter(v === "all" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]" aria-label="队列筛选">
                <SelectValue placeholder="全部队列" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部队列</SelectItem>
                <SelectItem value="source-sync">源同步</SelectItem>
                <SelectItem value="epg">EPG</SelectItem>
                <SelectItem value="health-check">健康检查</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DataTable
            table={table}
            columns={columns}
            loading={isLoading}
            onRowClick={(task) => setSelectedTaskId(task.id)}
          />

          <DataTablePagination table={table} />
        </TabsContent>

        <TabsContent value="scheduled" className="mt-4">
          <ScheduledTasksSection />
        </TabsContent>
      </Tabs>

      <Drawer
        direction="right"
        open={!!selectedTaskId}
        onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}
      >
        <DrawerContent className="sm:max-w-lg">
          <DrawerHeader>
            <DrawerTitle>任务详情</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-4">
            {drawerTask && (
              <TaskDetailContent
                task={drawerTask}
                onRetry={() => selectedTaskId && retryMutation.mutate(selectedTaskId)}
                onCancel={() => selectedTaskId && cancelMutation.mutate(selectedTaskId)}
                retryPending={!!selectedTaskId && retryingId === selectedTaskId}
                cancelPending={cancelMutation.isPending}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

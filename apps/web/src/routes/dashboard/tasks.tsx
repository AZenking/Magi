import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button } from "@magi/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@magi/ui/components/select";
import { DataTable } from "@magi/ui/components/data-table";
import { DataTablePagination } from "@magi/ui/components/data-table-pagination";
import { RefreshCwIcon } from "lucide-react";
import { useReactTable, getCoreRowModel, type VisibilityState } from "@tanstack/react-table";
import { getTaskColumns } from "@/features/dashboard/tasks/columns";

export const Route = createFileRoute("/dashboard/tasks")({
  component: TasksPage,
});

function TasksPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", page, pageSize, statusFilter],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<TaskVo> }>("/tasks", {
        params: {
          page,
          pageSize,
          status: statusFilter || undefined,
        },
      }),
  });

  const tasks = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 0;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }, [queryClient]);

  const columns = useMemo(() => getTaskColumns(), []);

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

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">任务管理</h1>
        <Button variant="outline" size="icon" onClick={refresh} aria-label="刷新">
          <RefreshCwIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

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
          </SelectContent>
        </Select>
      </div>

      <DataTable table={table} columns={columns} loading={isLoading} />

      <DataTablePagination table={table} />
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProgrammeVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button } from "@magi/ui/components/button";
import { DataTable } from "@magi/ui/components/data-table";
import { DataTablePagination } from "@magi/ui/components/data-table-pagination";
import { RefreshCwIcon } from "lucide-react";
import { useReactTable, getCoreRowModel, type VisibilityState } from "@tanstack/react-table";
import { getProgrammeColumns } from "@/features/dashboard/programmes/columns";

export const Route = createFileRoute("/dashboard/programmes")({
  component: ProgrammesPage,
});

function ProgrammesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const { data, isLoading } = useQuery({
    queryKey: ["programmes", page, pageSize],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<ProgrammeVo> }>("/programmes", {
        params: { page, pageSize },
      }),
  });

  const programmes = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 0;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["programmes"] });
  }, [queryClient]);

  const columns = useMemo(() => getProgrammeColumns(), []);

  const table = useReactTable({
    data: programmes,
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
        <h1 className="text-2xl font-bold tracking-tight">节目单</h1>
        <Button variant="outline" size="icon" onClick={refresh} aria-label="刷新">
          <RefreshCwIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <DataTable table={table} columns={columns} loading={isLoading} />

      <DataTablePagination table={table} />
    </>
  );
}

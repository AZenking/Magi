import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import type { ProgrammeVo, PaginatedResponse, SourceVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button } from "@magi/ui/components/button";
import { Input } from "@magi/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@magi/ui/components/select";
import { DataTable } from "@magi/ui/components/data-table";
import { DataTablePagination } from "@magi/ui/components/data-table-pagination";
import { DataTableViewOptions } from "@magi/ui/components/data-table-view-options";
import { DataTableColumnHeader } from "@magi/ui/components/data-table-column-header";
import { RefreshCwIcon } from "lucide-react";
import { useReactTable, getCoreRowModel, type VisibilityState } from "@tanstack/react-table";

export const Route = createFileRoute("/dashboard/sources/programmes")({
  component: ProgrammesPreviewPage,
});

function getColumns(): ColumnDef<ProgrammeVo>[] {
  return [
    {
      accessorKey: "xmltvChannelId",
      header: ({ column }) => <DataTableColumnHeader column={column} title="频道 ID" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.xmltvChannelId}</span>,
    },
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="标题" />,
      cell: ({ row }) => row.original.title ?? "-",
    },
    {
      accessorKey: "subTitle",
      header: ({ column }) => <DataTableColumnHeader column={column} title="副标题" />,
      cell: ({ row }) => row.original.subTitle ?? "-",
    },
    {
      accessorKey: "category",
      header: ({ column }) => <DataTableColumnHeader column={column} title="分类" />,
      cell: ({ row }) => row.original.category ?? "-",
    },
    {
      accessorKey: "startAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="开始" />,
      cell: ({ row }) => new Date(row.original.startAt).toLocaleString("zh-CN"),
    },
    {
      accessorKey: "stopAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="结束" />,
      cell: ({ row }) => new Date(row.original.stopAt).toLocaleString("zh-CN"),
    },
    {
      accessorKey: "desc",
      header: ({ column }) => <DataTableColumnHeader column={column} title="简介" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground line-clamp-2 max-w-[200px]">{row.original.desc ?? "-"}</span>
      ),
    },
  ];
}

function ProgrammesPreviewPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sourceId, setSourceId] = useState<string>("");
  const [channelId, setChannelId] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const { data: sourcesData } = useQuery({
    queryKey: ["sources", "xmltv"],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<SourceVo> }>("/sources", {
        params: { type: "xmltv", pageSize: 100 },
      }),
  });

  const xmltvSources = sourcesData?.data?.items ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["programmes", page, pageSize, sourceId, channelId],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<ProgrammeVo> }>("/programmes", {
        params: {
          page,
          pageSize,
          sourceId: sourceId || undefined,
          xmltvChannelId: channelId || undefined,
        },
      }),
  });

  const programmes = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 0;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["programmes"] });
  }, [queryClient]);

  const columns = useMemo(() => getColumns(), []);

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
      const next = typeof updater === "function" ? updater({ pageIndex: page - 1, pageSize }) : updater;
      setPage(next.pageIndex + 1);
      setPageSize(next.pageSize);
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">节目单预览</h1>
        <Button variant="outline" size="icon" onClick={refresh} aria-label="刷新">
          <RefreshCwIcon className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={sourceId}
          onValueChange={(v) => {
            setSourceId(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[200px]" aria-label="XMLTV 源筛选">
            <SelectValue placeholder="全部 XMLTV 源" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部 XMLTV 源</SelectItem>
            {xmltvSources.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="频道 ID 过滤"
          value={channelInput}
          onChange={(e) => setChannelInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setChannelId(channelInput);
              setPage(1);
            }
          }}
          className="max-w-[200px]"
          autoComplete="off"
        />
        <DataTableViewOptions table={table} />
      </div>

      <DataTable table={table} columns={columns} loading={isLoading} />
      <DataTablePagination table={table} />
    </>
  );
}

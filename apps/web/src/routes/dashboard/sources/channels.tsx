import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import type { ChannelVo, PaginatedResponse, SourceVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button } from "@magi/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@magi/ui/components/select";
import { Badge } from "@magi/ui/components/badge";
import { DataTable } from "@magi/ui/components/data-table";
import { DataTablePagination } from "@magi/ui/components/data-table-pagination";
import { DataTableViewOptions } from "@magi/ui/components/data-table-view-options";
import { DataTableColumnHeader } from "@magi/ui/components/data-table-column-header";
import { RefreshCwIcon } from "lucide-react";
import { useReactTable, getCoreRowModel, type VisibilityState } from "@tanstack/react-table";

export const Route = createFileRoute("/dashboard/sources/channels")({
  component: RawChannelsPage,
});

const streamStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  online: { label: "在线", variant: "default" },
  offline: { label: "离线", variant: "destructive" },
  degraded: { label: "降级", variant: "secondary" },
  unknown: { label: "未知", variant: "outline" },
};

function getColumns(): ColumnDef<ChannelVo>[] {
  return [
    {
      accessorKey: "displayName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="频道名" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.tvgLogo ? (
            <img src={row.original.tvgLogo} alt="" className="h-5 w-5 rounded object-contain" loading="lazy" />
          ) : (
            <div className="h-5 w-5 rounded bg-muted" />
          )}
          <span className="font-medium">{row.original.displayName}</span>
        </div>
      ),
    },
    {
      accessorKey: "groupTitle",
      header: ({ column }) => <DataTableColumnHeader column={column} title="分组" />,
      cell: ({ row }) => row.original.groupTitle ?? "-",
    },
    {
      accessorKey: "tvgId",
      header: ({ column }) => <DataTableColumnHeader column={column} title="tvgId" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.tvgId ?? "-"}</span>,
    },
    {
      accessorKey: "epgChannelId",
      header: ({ column }) => <DataTableColumnHeader column={column} title="EPG 绑定" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.epgChannelId ?? "-"}</span>,
    },
    {
      accessorKey: "epgMatchType",
      header: ({ column }) => <DataTableColumnHeader column={column} title="匹配方式" />,
      cell: ({ row }) => row.original.epgMatchType ?? "-",
    },
    {
      accessorKey: "active",
      header: ({ column }) => <DataTableColumnHeader column={column} title="激活" />,
      cell: ({ row }) => <Badge variant={row.original.active ? "default" : "secondary"}>{row.original.active ? "是" : "否"}</Badge>,
    },
    {
      accessorKey: "streamStatus",
      header: ({ column }) => <DataTableColumnHeader column={column} title="流状态" />,
      cell: ({ row }) => {
        const s = streamStatusMap[row.original.streamStatus ?? "unknown"] ?? { label: row.original.streamStatus, variant: "outline" as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="更新时间" />,
      cell: ({ row }) => new Date(row.original.updatedAt).toLocaleString("zh-CN"),
    },
  ];
}

function RawChannelsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sourceId, setSourceId] = useState<string>("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const { data: sourcesData } = useQuery({
    queryKey: ["sources", "m3u"],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<SourceVo> }>("/sources", {
        params: { type: "m3u", pageSize: 100 },
      }),
  });

  const m3uSources = sourcesData?.data?.items ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["raw-channels", page, pageSize, sourceId],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<ChannelVo> }>("/channels", {
        params: {
          page,
          pageSize,
          sourceId: sourceId || undefined,
        },
      }),
  });

  const channels = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 0;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["raw-channels"] });
  }, [queryClient]);

  const columns = useMemo(() => getColumns(), []);

  const table = useReactTable({
    data: channels,
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
        <h1 className="text-2xl font-bold tracking-tight">原始频道</h1>
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
          <SelectTrigger className="w-[200px]" aria-label="M3U 源筛选">
            <SelectValue placeholder="全部 M3U 源" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部 M3U 源</SelectItem>
            {m3uSources.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DataTableViewOptions table={table} />
      </div>

      <DataTable table={table} columns={columns} loading={isLoading} />
      <DataTablePagination table={table} />
    </>
  );
}

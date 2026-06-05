import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { CanonicalChannelVo, PaginatedResponse, UpdateOutputChannel } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button } from "@magi/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@magi/ui/components/select";
import { DataTable } from "@magi/ui/components/data-table";
import { DataTablePagination } from "@magi/ui/components/data-table-pagination";
import { DataTableViewOptions } from "@magi/ui/components/data-table-view-options";
import { RefreshCwIcon, DownloadIcon } from "lucide-react";
import { useReactTable, getCoreRowModel, type VisibilityState } from "@tanstack/react-table";
import { getChannelColumns } from "@/features/dashboard/channels/columns";
import { OutputChannelFormDialog } from "@/features/dashboard/channels/channel-form-dialog";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const Route = createFileRoute("/dashboard/channels")({
  component: ChannelsPage,
});

function ChannelsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [epgStatus, setEpgStatus] = useState<string>("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [editingChannel, setEditingChannel] = useState<CanonicalChannelVo | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["output-channels", page, pageSize, epgStatus],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<CanonicalChannelVo> }>("/output/channels", {
        params: {
          page,
          pageSize,
          epgStatus: epgStatus || undefined,
        },
      }),
  });

  const channels = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 0;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["output-channels"] });
  }, [queryClient]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateOutputChannel }) => {
      return apiClient<{ success: boolean; data: CanonicalChannelVo }>(`/output/channels/${id}`, {
        method: "PUT",
        body,
      });
    },
    onSuccess: () => {
      refresh();
    },
  });

  const columns = useMemo(() => getChannelColumns({
    onEdit: (ch) => setEditingChannel(ch),
  }), []);

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
        <h1 className="text-2xl font-bold tracking-tight">频道管理</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`${API_BASE}/output/m3u`} download aria-label="下载 M3U 文件">
              <DownloadIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              M3U
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`${API_BASE}/output/xmltv`} download aria-label="下载 XMLTV 文件">
              <DownloadIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              XMLTV
            </a>
          </Button>
          <Button variant="outline" size="icon" onClick={refresh} aria-label="刷新">
            <RefreshCwIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={epgStatus}
          onValueChange={(v) => {
            setEpgStatus(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]" aria-label="EPG 状态">
            <SelectValue placeholder="EPG 状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="matched_auto">自动匹配</SelectItem>
            <SelectItem value="matched_manual">手动匹配</SelectItem>
            <SelectItem value="unmatched">未匹配</SelectItem>
            <SelectItem value="conflict">冲突</SelectItem>
          </SelectContent>
        </Select>
        <DataTableViewOptions table={table} />
      </div>

      <DataTable table={table} columns={columns} loading={isLoading} />

      <DataTablePagination table={table} />

      {editingChannel && (
        <OutputChannelFormDialog
          open={!!editingChannel}
          onOpenChange={(open) => { if (!open) setEditingChannel(null); }}
          channel={editingChannel}
          onSubmit={async (body) => { await updateMutation.mutateAsync({ id: editingChannel.id, body }); }}
        />
      )}
    </>
  );
}

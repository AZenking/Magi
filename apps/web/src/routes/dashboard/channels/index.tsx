import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CanonicalChannelVo, PaginatedResponse, UpdateOutputChannel } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button } from "@magi/ui/components/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@magi/ui/components/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@magi/ui/components/select";
import { DataTable } from "@magi/ui/components/data-table";
import { DataTablePagination } from "@magi/ui/components/data-table-pagination";
import { DataTableViewOptions } from "@magi/ui/components/data-table-view-options";
import { RefreshCwIcon, DownloadIcon, ActivityIcon, SearchIcon, EyeOffIcon, TrashIcon } from "lucide-react";
import { useReactTable, getCoreRowModel, type VisibilityState, type RowSelectionState } from "@tanstack/react-table";
import { getChannelColumns } from "@/features/dashboard/channels/columns";
import { OutputChannelFormDialog } from "@/features/dashboard/channels/channel-form-dialog";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const Route = createFileRoute("/dashboard/channels/")({
  component: ChannelsPage,
});

function ChannelsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [epgStatus, setEpgStatus] = useState<string>("");
  const [outputStatus, setOutputStatus] = useState<string>("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [editingChannel, setEditingChannel] = useState<CanonicalChannelVo | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ["output-channels", page, pageSize, epgStatus, outputStatus, debouncedSearch],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<CanonicalChannelVo> }>("/output/channels", {
        params: {
          page,
          pageSize,
          epgStatus: epgStatus || undefined,
          outputStatus: outputStatus || undefined,
          search: debouncedSearch || undefined,
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

  const checkStreamsMutation = useMutation({
    mutationFn: () =>
      apiClient<{ success: boolean; data: { taskId: string } }>("/output/check-streams", {
        method: "POST",
        body: {},
      }),
    onSuccess: () => {
      toast.success("播放源检查已提交，检测中…");
      setPollingActive(true);
    },
    onError: (err) => {
      toast.error("提交检查失败", { description: err.message });
    },
  });

  // Polling after stream check submission
  const [pollingActive, setPollingActive] = useState(false);
  useEffect(() => {
    if (!pollingActive) return;
    const start = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - start > 30_000) {
        setPollingActive(false);
        clearInterval(interval);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["output-channels"] });
    }, 5_000);
    return () => clearInterval(interval);
  }, [pollingActive, queryClient]);

  const columns = useMemo(() => getChannelColumns({
    onEdit: (ch) => setEditingChannel(ch),
    onToggleHidden: (ch) => updateMutation.mutate({ id: ch.id, body: { hidden: !ch.hidden } }),
  }), [updateMutation]);

  const batchMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: "hide" | "show" | "delete" }) =>
      apiClient<{ success: boolean; data: { updated: number } }>("/output/channels/batch", {
        method: "POST",
        body: { ids, action },
      }),
    onSuccess: (_, vars) => {
      setRowSelection({});
      refresh();
      toast.success(vars.action === "delete" ? "已删除" : "已更新");
    },
    onError: (err) => {
      toast.error("批量操作失败", { description: err.message });
    },
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]).map((i) => channels[parseInt(i)]?.id).filter(Boolean);

  const table = useReactTable({
    data: channels,
    columns,
    pageCount: totalPages,
    state: {
      columnVisibility,
      rowSelection,
      pagination: { pageIndex: page - 1, pageSize },
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkStreamsMutation.mutate()}
            disabled={checkStreamsMutation.isPending}
          >
            <ActivityIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            {checkStreamsMutation.isPending ? "提交中…" : "检查频道流"}
          </Button>
          <Button variant="outline" size="icon" onClick={refresh} aria-label="刷新">
            <RefreshCwIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索频道…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-9 w-[200px] rounded-md border border-input bg-transparent px-8 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
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
        <Select
          value={outputStatus}
          onValueChange={(v) => {
            setOutputStatus(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]" aria-label="播放源状态">
            <SelectValue placeholder="播放源状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="active">正常</SelectItem>
            <SelectItem value="degraded">降级</SelectItem>
            <SelectItem value="unavailable">不可用</SelectItem>
            <SelectItem value="unknown">未知</SelectItem>
          </SelectContent>
        </Select>
        <DataTableViewOptions table={table} />
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">已选 {selectedIds.length} 个频道</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => batchMutation.mutate({ ids: selectedIds, action: "hide" })}
            disabled={batchMutation.isPending}
          >
            <EyeOffIcon className="mr-1 h-3.5 w-3.5" />
            隐藏
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => batchMutation.mutate({ ids: selectedIds, action: "show" })}
            disabled={batchMutation.isPending}
          >
            显示
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmBatchDelete(true)}
            disabled={batchMutation.isPending}
          >
            <TrashIcon className="mr-1 h-3.5 w-3.5" />
            删除
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRowSelection({})}>
            取消选择
          </Button>
        </div>
      )}

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

      <AlertDialog open={confirmBatchDelete} onOpenChange={setConfirmBatchDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除选中的 {selectedIds.length} 个频道吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { batchMutation.mutate({ ids: selectedIds, action: "delete" }); setConfirmBatchDelete(false); }}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

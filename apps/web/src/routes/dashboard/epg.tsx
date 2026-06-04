import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SourceVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { toast } from "sonner";
import { Button } from "@magi/ui/components/button";
import { Input } from "@magi/ui/components/input";
import { Tabs, TabsList, TabsTrigger } from "@magi/ui/components/tabs";
import { DataTable } from "@magi/ui/components/data-table";
import { DataTablePagination } from "@magi/ui/components/data-table-pagination";
import { DataTableViewOptions } from "@magi/ui/components/data-table-view-options";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@magi/ui/components/alert-dialog";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useReactTable, getCoreRowModel, type SortingState, type VisibilityState } from "@tanstack/react-table";
import { getSourceColumns } from "@/features/dashboard/epg/columns";
import { SourceFormDialog } from "@/features/dashboard/epg/source-form-dialog";

type SourceType = "m3u" | "xmltv";

export const Route = createFileRoute("/dashboard/epg")({
  component: EpgPage,
});

function EpgPage() {
  const queryClient = useQueryClient();
  const [activeType, setActiveType] = useState<SourceType>("m3u");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<SourceVo | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const sortBy = sorting[0]?.id;
  const sortDir = sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["sources", activeType, search, page, pageSize, sortBy, sortDir],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<SourceVo> }>(
        "/sources",
        {
          params: {
            type: activeType,
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
  const totalPages = data?.data?.totalPages ?? 0;

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["sources"] });
  }, [queryClient]);

  const handleCreate = useCallback(
    async (formData: { name: string; url: string; enabled: boolean }) => {
      try {
        await apiClient("/sources", {
          method: "POST",
          body: { ...formData, type: activeType },
        });
        toast.success("源添加成功");
        refresh();
      } catch (err) {
        toast.error("源添加失败", {
          description: err instanceof Error ? err.message : "请稍后重试",
        });
        throw err;
      }
    },
    [activeType, refresh],
  );

  const handleUpdate = useCallback(
    async (formData: { name: string; url: string; enabled: boolean }) => {
      if (!editingSource) return;
      try {
        await apiClient(`/sources/${editingSource.type}/${editingSource.id}`, {
          method: "PUT",
          body: formData,
        });
        toast.success("源更新成功");
        refresh();
      } catch (err) {
        toast.error("源更新失败", {
          description: err instanceof Error ? err.message : "请稍后重试",
        });
        throw err;
      }
    },
    [editingSource, refresh],
  );

  const handleDelete = useCallback(
    async (source: SourceVo) => {
      setDeleting(source.id);
      try {
        await apiClient(`/sources/${source.type}/${source.id}`, { method: "DELETE" });
        toast.success("源删除成功");
        refresh();
      } catch (err) {
        toast.error("源删除失败", {
          description: err instanceof Error ? err.message : "请稍后重试",
        });
      } finally {
        setDeleting(null);
        setConfirmDeleteId(null);
      }
    },
    [refresh],
  );

  const handleSync = useCallback(
    async (source: SourceVo) => {
      setSyncingId(source.id);
      try {
        const result = await apiClient<{ success: boolean; data: { status: string; importedCount?: number; channelCount?: number; programmeCount?: number } }>(
          `/sources/${source.type}/${source.id}/sync`,
          { method: "POST" },
        );
        if (result.data?.status === "success") {
          toast.success("同步成功", {
            description: `导入: ${result.data.importedCount ?? result.data.channelCount ?? 0} 条`,
          });
        } else {
          toast.warning("同步完成但未成功", {
            description: "请检查源 URL 是否正确",
          });
        }
        refresh();
      } catch (err) {
        toast.error("同步失败", {
          description: err instanceof Error ? err.message : "请稍后重试",
        });
      } finally {
        setSyncingId(null);
      }
    },
    [refresh],
  );

  const columns = useMemo(
    () =>
      getSourceColumns({
        onEdit: (source) => {
          setEditingSource(source);
          setDialogOpen(true);
        },
        onDelete: (source) => setConfirmDeleteId(source.id),
        onSync: handleSync,
        syncingId,
      }),
    [handleSync, syncingId],
  );

  const table = useReactTable({
    data: sources,
    columns,
    pageCount: totalPages,
    state: {
      sorting,
      columnVisibility,
      pagination: { pageIndex: page - 1, pageSize },
    },
    manualPagination: true,
    manualSorting: true,
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex: page - 1, pageSize })
          : updater;
      setPage(next.pageIndex + 1);
      setPageSize(next.pageSize);
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(next);
      setPage(1);
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  const deleteTarget = sources.find((s) => s.id === confirmDeleteId);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">源管理</h1>
        <Button
          onClick={() => {
            setEditingSource(null);
            setDialogOpen(true);
          }}
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          添加源
        </Button>
      </div>

      <Tabs
        value={activeType}
        onValueChange={(v) => {
          setActiveType(v as SourceType);
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="m3u">M3U 源</TabsTrigger>
          <TabsTrigger value="xmltv">EPG/XMLTV 源</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="搜索名称或 URL…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearch(searchInput);
                setPage(1);
              }
            }}
            onClear={() => {
              setSearchInput("");
              setSearch("");
              setPage(1);
            }}
            className="pl-8"
            aria-label="搜索源"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setSearch(searchInput);
            setPage(1);
          }}
          aria-label="搜索"
        >
          <SearchIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
        <DataTableViewOptions table={table} />
      </div>

      <DataTable table={table} columns={columns} loading={isLoading} />

      <DataTablePagination table={table} />

      <SourceFormDialog
        key={editingSource?.id ?? "create"}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingSource(null);
        }}
        source={editingSource}
        sourceType={activeType}
        onSubmit={editingSource ? handleUpdate : handleCreate}
      />

      {deleteTarget && (
        <AlertDialog open onOpenChange={() => setConfirmDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除源「{deleteTarget.name}」吗？此操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmDeleteId(null)}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDelete(deleteTarget)}
                disabled={deleting === deleteTarget.id}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting === deleteTarget.id ? "删除中…" : "删除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

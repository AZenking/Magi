"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EpgSourceVo, PaginatedResponse } from "@magi/types";
import { apiClient } from "@/services/api";
import { toast } from "sonner";
import { Button } from "@magi/ui/components/button";
import { Input } from "@magi/ui/components/input";
import { Tabs, TabsList, TabsTrigger } from "@magi/ui/components/tabs";
import { DataTable } from "@magi/ui/components/data-table";
import { DataTablePagination } from "@magi/ui/components/data-table-pagination";
import { DataTableViewOptions } from "@magi/ui/components/data-table-view-options";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useReactTable, getCoreRowModel, type SortingState, type VisibilityState } from "@tanstack/react-table";
import { getSourceColumns } from "./columns";
import { SourceFormDialog } from "./source-form-dialog";

type SourceType = "m3u" | "xmltv";

export default function EpgPage() {
  const queryClient = useQueryClient();
  const [activeType, setActiveType] = useState<SourceType>("m3u");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<EpgSourceVo | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const sortBy = sorting[0]?.id;
  const sortDir = sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["sources", activeType, search, page, pageSize, sortBy, sortDir],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<EpgSourceVo> }>(
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
      }
    },
    [activeType, refresh],
  );

  const handleUpdate = useCallback(
    async (formData: { name: string; url: string; enabled: boolean }) => {
      if (!editingSource) return;
      try {
        await apiClient(`/sources/${editingSource.id}`, {
          method: "PUT",
          body: formData,
        });
        toast.success("源更新成功");
        refresh();
      } catch (err) {
        toast.error("源更新失败", {
          description: err instanceof Error ? err.message : "请稍后重试",
        });
      }
    },
    [editingSource, refresh],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeleting(id);
      try {
        await apiClient(`/sources/${id}`, { method: "DELETE" });
        toast.success("源删除成功");
        refresh();
      } catch (err) {
        toast.error("源删除失败", {
          description: err instanceof Error ? err.message : "请稍后重试",
        });
      } finally {
        setDeleting(null);
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
        onDelete: (source) => handleDelete(source.id),
      }),
    [handleDelete],
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
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索名称或 URL..."
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
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setSearch(searchInput);
            setPage(1);
          }}
        >
          <SearchIcon className="h-4 w-4" />
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
    </>
  );
}

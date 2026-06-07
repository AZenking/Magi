import { type ColumnDef } from "@tanstack/react-table";
import type { SourceVo } from "@magi/types";
import { Badge } from "@magi/ui/components/badge";
import { Button } from "@magi/ui/components/button";
import { DataTableColumnHeader } from "@magi/ui/components/data-table-column-header";
import { PencilIcon, TrashIcon, RefreshCwIcon, ActivityIcon } from "lucide-react";

const checkStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  online: { label: "正常", variant: "default" },
  offline: { label: "不可达", variant: "destructive" },
  unknown: { label: "未知", variant: "outline" },
};

interface ColumnsContext {
  onEdit: (source: SourceVo) => void;
  onDelete: (source: SourceVo) => void;
  onSync: (source: SourceVo) => void;
  onCheck: (source: SourceVo) => void;
  syncingId: string | null;
  checkingId: string | null;
}

export function getSourceColumns({ onEdit, onDelete, onSync, onCheck, syncingId, checkingId }: ColumnsContext): ColumnDef<SourceVo>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="名称" />,
    },
    {
      accessorKey: "url",
      header: "URL",
      cell: ({ row }) => (
        <span className="max-w-[300px] truncate block" title={row.original.url}>
          {row.original.url}
        </span>
      ),
    },
    {
      accessorKey: "enabled",
      header: ({ column }) => <DataTableColumnHeader column={column} title="状态" />,
      cell: ({ row }) => (
        <Badge variant={row.original.enabled ? "default" : "secondary"}>
          {row.original.enabled ? "启用" : "禁用"}
        </Badge>
      ),
    },
    {
      accessorKey: "lastSyncAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="最后同步" />,
      cell: ({ row }) =>
        row.original.lastSyncAt
          ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" }).format(new Date(row.original.lastSyncAt))
          : "-",
    },
    {
      accessorKey: "checkStatus",
      header: ({ column }) => <DataTableColumnHeader column={column} title="源状态" />,
      cell: ({ row }) => {
        const s = checkStatusMap[row.original.checkStatus ?? ""] ?? { label: "-", variant: "outline" as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      accessorKey: "lastCheckAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="最后检测" />,
      cell: ({ row }) =>
        row.original.lastCheckAt
          ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" }).format(new Date(row.original.lastCheckAt))
          : "-",
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="创建时间" />,
      cell: ({ row }) =>
        new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" }).format(new Date(row.original.createdAt)),
    },
    {
      id: "actions",
      header: undefined,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onCheck(row.original)}
            disabled={checkingId === row.original.id}
            aria-label={`检测 ${row.original.name}`}
          >
            <ActivityIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onSync(row.original)}
            disabled={syncingId === row.original.id}
            aria-label={`同步 ${row.original.name}`}
          >
            <RefreshCwIcon className={`h-4 w-4 ${syncingId === row.original.id ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(row.original)}
            aria-label={`编辑 ${row.original.name}`}
          >
            <PencilIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDelete(row.original)}
            aria-label={`删除 ${row.original.name}`}
          >
            <TrashIcon className="h-4 w-4 text-destructive" aria-hidden="true" />
          </Button>
        </div>
      ),
    },
  ];
}

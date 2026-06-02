"use client";

import { type ColumnDef } from "@tanstack/react-table";
import type { EpgSourceVo } from "@magi/types";
import { Badge } from "@magi/ui/components/badge";
import { Button } from "@magi/ui/components/button";
import { DataTableColumnHeader } from "@magi/ui/components/data-table-column-header";
import { PencilIcon, TrashIcon } from "lucide-react";

interface ColumnsContext {
  onEdit: (source: EpgSourceVo) => void;
  onDelete: (source: EpgSourceVo) => void;
}

export function getSourceColumns({ onEdit, onDelete }: ColumnsContext): ColumnDef<EpgSourceVo>[] {
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
      accessorKey: "lastSyncedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="最后同步" />,
      cell: ({ row }) =>
        row.original.lastSyncedAt
          ? new Date(row.original.lastSyncedAt).toLocaleString("zh-CN")
          : "-",
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="创建时间" />,
      cell: ({ row }) =>
        new Date(row.original.createdAt).toLocaleString("zh-CN"),
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
            onClick={() => onEdit(row.original)}
          >
            <PencilIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDelete(row.original)}
          >
            <TrashIcon className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];
}

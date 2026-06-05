import { type ColumnDef } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import type { CanonicalChannelVo } from "@magi/types";
import { Badge } from "@magi/ui/components/badge";
import { Button } from "@magi/ui/components/button";
import { DataTableColumnHeader } from "@magi/ui/components/data-table-column-header";
import { PencilIcon, ExternalLinkIcon } from "lucide-react";

const epgStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  matched_auto: { label: "自动匹配", variant: "default" },
  matched_manual: { label: "手动匹配", variant: "secondary" },
  unmatched: { label: "未匹配", variant: "outline" },
  conflict: { label: "冲突", variant: "destructive" },
};

const outputStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "活跃", variant: "default" },
  inactive: { label: "停用", variant: "secondary" },
  error: { label: "异常", variant: "destructive" },
};

interface ColumnContext {
  onEdit?: (channel: CanonicalChannelVo) => void;
}

export function getChannelColumns(ctx?: ColumnContext): ColumnDef<CanonicalChannelVo>[] {
  return [
    {
      accessorKey: "standardName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="频道名称" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.starred && <span className="text-yellow-500" aria-label="已收藏">&#9733;</span>}
          {row.original.standardLogo ? (
            <img
              src={row.original.standardLogo}
              alt=""
              className="h-5 w-5 rounded object-contain"
              loading="lazy"
            />
          ) : (
            <div className="h-5 w-5 rounded bg-muted" />
          )}
          <Link
            to="/dashboard/channels/$channelId"
            params={{ channelId: row.original.id }}
            className="font-medium hover:underline"
          >
            {row.original.standardName}
          </Link>
        </div>
      ),
    },
    {
      accessorKey: "standardGroup",
      header: ({ column }) => <DataTableColumnHeader column={column} title="分组" />,
      cell: ({ row }) => row.original.standardGroup ?? "-",
    },
    {
      accessorKey: "epgStatus",
      header: ({ column }) => <DataTableColumnHeader column={column} title="EPG" />,
      cell: ({ row }) => {
        const s = epgStatusMap[row.original.epgStatus] ?? { label: row.original.epgStatus, variant: "outline" as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      accessorKey: "outputStatus",
      header: ({ column }) => <DataTableColumnHeader column={column} title="输出" />,
      cell: ({ row }) => {
        const s = outputStatusMap[row.original.outputStatus] ?? { label: row.original.outputStatus, variant: "outline" as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      accessorKey: "epgChannelId",
      header: ({ column }) => <DataTableColumnHeader column={column} title="tvg-id" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.epgChannelId ?? "-"}</span>
      ),
    },
    {
      accessorKey: "channelNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="频道号" />,
      cell: ({ row }) => row.original.channelNumber ?? "-",
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard/channels/$channelId" params={{ channelId: row.original.id }} aria-label="详情">
              <ExternalLinkIcon className="h-4 w-4" />
            </Link>
          </Button>
          {ctx?.onEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); ctx.onEdit!(row.original); }}
              aria-label="编辑"
            >
              <PencilIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];
}

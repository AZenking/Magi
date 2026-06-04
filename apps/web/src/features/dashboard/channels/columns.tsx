import { type ColumnDef } from "@tanstack/react-table";
import type { CanonicalChannelVo } from "@magi/types";
import { Badge } from "@magi/ui/components/badge";
import { DataTableColumnHeader } from "@magi/ui/components/data-table-column-header";

const epgStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  matched: { label: "已匹配", variant: "default" },
  unmatched: { label: "未匹配", variant: "outline" },
  conflict: { label: "冲突", variant: "destructive" },
};

const outputStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "活跃", variant: "default" },
  inactive: { label: "停用", variant: "secondary" },
  error: { label: "异常", variant: "destructive" },
};

export function getChannelColumns(): ColumnDef<CanonicalChannelVo>[] {
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
          <span className="font-medium">{row.original.standardName}</span>
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
      accessorKey: "epgMatchType",
      header: ({ column }) => <DataTableColumnHeader column={column} title="匹配方式" />,
      cell: ({ row }) => row.original.epgMatchType ?? "-",
    },
    {
      accessorKey: "channelNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="频道号" />,
      cell: ({ row }) => row.original.channelNumber ?? "-",
    },
  ];
}

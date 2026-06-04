import { type ColumnDef } from "@tanstack/react-table";
import type { ProgrammeVo } from "@magi/types";
import { DataTableColumnHeader } from "@magi/ui/components/data-table-column-header";

const dtf = new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" });

export function getProgrammeColumns(): ColumnDef<ProgrammeVo>[] {
  return [
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="节目名称" />,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.title ?? "未命名"}</span>
      ),
    },
    {
      accessorKey: "startAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="开始时间" />,
      cell: ({ row }) => dtf.format(new Date(row.original.startAt)),
    },
    {
      id: "duration",
      header: ({ column }) => <DataTableColumnHeader column={column} title="时长" />,
      cell: ({ row }) => {
        const start = new Date(row.original.startAt).getTime();
        const stop = new Date(row.original.stopAt).getTime();
        const mins = Math.round((stop - start) / 60000);
        if (mins < 60) return `${mins}分钟`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m ? `${h}h${m}m` : `${h}h`;
      },
    },
    {
      accessorKey: "category",
      header: ({ column }) => <DataTableColumnHeader column={column} title="分类" />,
      cell: ({ row }) => row.original.category ?? "-",
    },
    {
      accessorKey: "xmltvChannelId",
      header: ({ column }) => <DataTableColumnHeader column={column} title="频道" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs font-mono">{row.original.xmltvChannelId}</span>
      ),
    },
  ];
}

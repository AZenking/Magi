import { type ColumnDef } from "@tanstack/react-table";
import type { TaskVo } from "@magi/types";
import { Badge } from "@magi/ui/components/badge";
import { DataTableColumnHeader } from "@magi/ui/components/data-table-column-header";

const statusMap: Record<TaskVo["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "等待中", variant: "outline" },
  running: { label: "运行中", variant: "default" },
  success: { label: "成功", variant: "secondary" },
  failed: { label: "失败", variant: "destructive" },
};

const taskTypeMap: Record<string, string> = {
  "m3u-sync": "M3U 同步",
  "xmltv-sync": "XMLTV 同步",
  "source-check": "源检查",
  "stream-check": "流检查",
};

const dtf = new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" });

export function getTaskColumns(): ColumnDef<TaskVo>[] {
  return [
    {
      accessorKey: "taskType",
      header: ({ column }) => <DataTableColumnHeader column={column} title="任务类型" />,
      cell: ({ row }) => taskTypeMap[row.original.taskType] ?? row.original.taskType,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="状态" />,
      cell: ({ row }) => {
        const s = statusMap[row.original.status];
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      accessorKey: "progress",
      header: ({ column }) => <DataTableColumnHeader column={column} title="进度" />,
      cell: ({ row }) => {
        const p = row.original.progress;
        if (row.original.status === "success") return "100%";
        if (row.original.status === "pending") return "-";
        return `${p}%`;
      },
    },
    {
      accessorKey: "startedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="开始时间" />,
      cell: ({ row }) => dtf.format(new Date(row.original.startedAt)),
    },
    {
      id: "duration",
      header: ({ column }) => <DataTableColumnHeader column={column} title="耗时" />,
      cell: ({ row }) => {
        const { startedAt, finishedAt, status } = row.original;
        if (status === "pending") return "-";
        const end = finishedAt ? new Date(finishedAt) : new Date();
        const ms = end.getTime() - new Date(startedAt).getTime();
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
      },
    },
    {
      accessorKey: "importedCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="导入" />,
      cell: ({ row }) => row.original.importedCount || "-",
    },
    {
      id: "changes",
      header: ({ column }) => <DataTableColumnHeader column={column} title="变更" />,
      cell: ({ row }) => {
        const { addedCount, updatedCount, removedCount } = row.original;
        if (!addedCount && !updatedCount && !removedCount) return "-";
        return `+${addedCount} / ~${updatedCount} / -${removedCount}`;
      },
    },
    {
      accessorKey: "error",
      header: ({ column }) => <DataTableColumnHeader column={column} title="错误" />,
      cell: ({ row }) => {
        const err = row.original.error;
        if (!err) return "-";
        return (
          <span className="max-w-[200px] truncate block text-destructive" title={err}>
            {err}
          </span>
        );
      },
    },
  ];
}

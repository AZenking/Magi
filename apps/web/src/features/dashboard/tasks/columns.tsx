import { type ColumnDef } from "@tanstack/react-table";
import type { TaskVo } from "@magi/types";
import { Badge } from "@magi/ui/components/badge";
import { Button } from "@magi/ui/components/button";
import { DataTableColumnHeader } from "@magi/ui/components/data-table-column-header";
import { RotateCwIcon, XIcon } from "lucide-react";

const statusMap: Record<TaskVo["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "等待中", variant: "outline" },
  running: { label: "运行中", variant: "default" },
  success: { label: "成功", variant: "secondary" },
  failed: { label: "失败", variant: "destructive" },
  cancelled: { label: "已取消", variant: "outline" },
};

const taskTypeMap: Record<string, string> = {
  "m3u-sync": "M3U 同步",
  "xmltv-sync": "XMLTV 同步",
  "epg-match": "EPG 匹配",
  "source-check": "源检查",
  "stream-check": "流检查",
  "import-epg": "导入 EPG",
  "refresh-epg": "刷新 EPG",
};

const queueNameMap: Record<string, string> = {
  "source-sync": "源同步",
  "epg": "EPG",
  "health-check": "健康检查",
};

const dtf = new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" });

interface ColumnContext {
  onRetry?: (task: TaskVo) => void;
  onCancel?: (task: TaskVo) => void;
  retryingId?: string | null;
}

export function getTaskColumns(ctx?: ColumnContext): ColumnDef<TaskVo>[] {
  return [
    {
      accessorKey: "taskType",
      header: ({ column }) => <DataTableColumnHeader column={column} title="任务类型" />,
      cell: ({ row }) => taskTypeMap[row.original.taskType] ?? row.original.taskType,
    },
    {
      accessorKey: "queueName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="队列" />,
      cell: ({ row }) => queueNameMap[row.original.queueName ?? ""] ?? row.original.queueName ?? "-",
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="状态" />,
      cell: ({ row }) => {
        const s = statusMap[row.original.status];
        if (!s) return <Badge variant="outline">{row.original.status}</Badge>;
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      accessorKey: "progress",
      header: ({ column }) => <DataTableColumnHeader column={column} title="进度" />,
      cell: ({ row }) => {
        const p = row.original.progress;
        if (row.original.status === "success") return "100%";
        if (row.original.status === "pending" || row.original.status === "cancelled") return "-";
        return (
          <div className="flex items-center gap-2">
            <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${p}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{p}%</span>
          </div>
        );
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
      accessorKey: "attemptsMade",
      header: ({ column }) => <DataTableColumnHeader column={column} title="重试" />,
      cell: ({ row }) => {
        const a = row.original.attemptsMade;
        return a > 0 ? <span className="text-orange-500">{a}</span> : "-";
      },
    },
    {
      accessorKey: "importedCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="导入" />,
      cell: ({ row }) => row.original.importedCount || "-",
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
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => {
        const task = row.original;
        if (task.status === "failed" && ctx?.onRetry) {
          return (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); ctx.onRetry!(task); }}
              disabled={ctx.retryingId === task.id}
              aria-label="重试"
            >
              <RotateCwIcon className="h-4 w-4" />
            </Button>
          );
        }
        if (task.status === "pending" && ctx?.onCancel) {
          return (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); ctx.onCancel!(task); }}
              aria-label="取消"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          );
        }
        return null;
      },
    },
  ];
}

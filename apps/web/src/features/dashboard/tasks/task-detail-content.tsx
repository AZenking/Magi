import type { TaskVo } from "@magi/types";
import { Button } from "@magi/ui/components/button";
import { Badge } from "@magi/ui/components/badge";
import { RotateCwIcon, XIcon } from "lucide-react";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
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

const dtf = new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" });

interface TaskDetailContentProps {
  task: TaskVo;
  onRetry: () => void;
  onCancel: () => void;
  retryPending?: boolean;
  cancelPending?: boolean;
}

export function TaskDetailContent({
  task,
  onRetry,
  onCancel,
  retryPending,
  cancelPending,
}: TaskDetailContentProps) {
  const s = statusMap[task.status] ?? { label: task.status, variant: "outline" as const };
  const isActive = task.status === "pending";
  const jd = task.jobDetail;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">
          {taskTypeMap[task.taskType] ?? task.taskType}
        </h2>
        <Badge variant={s.variant}>{s.label}</Badge>
        {jd && (
          <Badge variant="outline" className="text-xs">
            BullMQ: {jd.state}
          </Badge>
        )}
      </div>

      <div className="space-y-4 rounded-md border p-4">
        <h3 className="font-medium text-sm text-muted-foreground">概览</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">任务 ID</dt>
          <dd className="font-mono text-xs">{task.id}</dd>
          <dt className="text-muted-foreground">任务类型</dt>
          <dd>{taskTypeMap[task.taskType] ?? task.taskType}</dd>
          <dt className="text-muted-foreground">队列</dt>
          <dd>{task.queueName ?? "-"}</dd>
          <dt className="text-muted-foreground">源类型</dt>
          <dd>{task.sourceType}</dd>
          <dt className="text-muted-foreground">源 ID</dt>
          <dd className="font-mono text-xs">{task.sourceId}</dd>
          <dt className="text-muted-foreground">重试次数</dt>
          <dd>{jd?.attemptsMade ?? task.attemptsMade}</dd>
          <dt className="text-muted-foreground">创建时间</dt>
          <dd>{dtf.format(new Date(task.createdAt))}</dd>
          <dt className="text-muted-foreground">开始时间</dt>
          <dd>{dtf.format(new Date(task.startedAt))}</dd>
          {(jd?.processedOn ?? task.processedOn) && (
            <>
              <dt className="text-muted-foreground">处理时间</dt>
              <dd>{dtf.format(new Date((jd?.processedOn ?? task.processedOn)!))}</dd>
            </>
          )}
          {(jd?.finishedOn ?? task.finishedAt) && (
            <>
              <dt className="text-muted-foreground">完成时间</dt>
              <dd>{dtf.format(new Date((jd?.finishedOn ?? task.finishedAt)!))}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="space-y-4 rounded-md border p-4">
        <h3 className="font-medium text-sm text-muted-foreground">进度</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>{task.currentStep ?? "-"}</span>
            <span>{task.progress}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${task.status === "success" ? 100 : task.progress}%` }}
            />
          </div>
        </div>

        <h3 className="font-medium text-sm text-muted-foreground pt-2">统计</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">导入</dt>
          <dd>{task.importedCount}</dd>
          <dt className="text-muted-foreground">新增</dt>
          <dd>{task.addedCount}</dd>
          <dt className="text-muted-foreground">更新</dt>
          <dd>{task.updatedCount}</dd>
          <dt className="text-muted-foreground">删除</dt>
          <dd>{task.removedCount}</dd>
        </dl>
      </div>

      {task.error && (
        <div className="space-y-2 rounded-md border border-destructive p-4">
          <h3 className="font-medium text-destructive">错误信息</h3>
          <pre className="whitespace-pre-wrap text-sm text-destructive">{task.error}</pre>
          {jd?.stacktrace && jd.stacktrace.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">查看堆栈跟踪</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-destructive/80 overflow-auto max-h-64">
                {jd.stacktrace.join("\n")}
              </pre>
            </details>
          )}
        </div>
      )}

      {!jd?.jobAvailable && task.status !== "success" && (
        <div className="rounded-md border border-muted p-4 text-sm text-muted-foreground">
          BullMQ job 已清理，无法获取实时状态
        </div>
      )}

      <div className="flex gap-2">
        {task.status === "failed" && (
          <Button size="sm" onClick={onRetry} disabled={retryPending}>
            <RotateCwIcon className="mr-2 h-4 w-4" />
            重试
          </Button>
        )}
        {isActive && (
          <Button size="sm" variant="destructive" onClick={onCancel} disabled={cancelPending}>
            <XIcon className="mr-2 h-4 w-4" />
            取消
          </Button>
        )}
      </div>
    </div>
  );
}

export { statusMap, taskTypeMap, dtf };

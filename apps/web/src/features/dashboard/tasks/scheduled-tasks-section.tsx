import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@magi/ui/components/card";
import { Badge } from "@magi/ui/components/badge";
import { Button } from "@magi/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@magi/ui/components/select";
import { toast } from "sonner";
import { PlayIcon } from "lucide-react";

interface ScheduledJob {
  id: string;
  name: string;
  queueName: string;
  taskType: string;
  description: string;
  enabled: boolean;
  intervalMs: number | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
}

const INTERVAL_OPTIONS = [
  { label: "每 5 分钟", value: 300_000 },
  { label: "每 15 分钟", value: 900_000 },
  { label: "每 30 分钟", value: 1_800_000 },
  { label: "每 1 小时", value: 3_600_000 },
  { label: "每 6 小时", value: 21_600_000 },
  { label: "每 12 小时", value: 43_200_000 },
  { label: "每 24 小时", value: 86_400_000 },
];

function formatInterval(ms: number | null): string {
  if (!ms) return "-";
  if (ms < 3_600_000) return `每 ${ms / 60_000} 分钟`;
  if (ms < 86_400_000) return `每 ${ms / 3_600_000} 小时`;
  return `每 ${ms / 86_400_000} 天`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ScheduledTasksSection() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["scheduled-jobs"],
    queryFn: () => apiClient<{ success: boolean; data: ScheduledJob[] }>("/tasks/scheduled"),
    staleTime: 10_000,
  });

  const triggerMutation = useMutation({
    mutationFn: (jobId: string) =>
      apiClient<{ success: boolean; data: { taskId: string } }>(`/tasks/scheduled/${jobId}/trigger`, { method: "POST" }),
    onSuccess: () => {
      toast.success("任务已触发");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err) => toast.error("触发失败", { description: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ jobId, intervalMs }: { jobId: string; intervalMs: number }) =>
      apiClient<{ success: boolean; data: null }>(`/tasks/scheduled/${jobId}`, { method: "PUT", body: { intervalMs } }),
    onSuccess: () => {
      toast.success("已更新");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["scheduled-jobs"] });
    },
    onError: (err) => toast.error("更新失败", { description: err.message }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground py-4">加载中…</div>;

  const jobs = data?.data ?? [];

  return (
    <div className="grid gap-4">
      {jobs.map((job) => (
        <Card key={job.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{job.name}</CardTitle>
                <Badge variant={job.enabled ? "default" : "secondary"}>
                  {job.enabled ? "已启用" : "已禁用"}
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => triggerMutation.mutate(job.id)}
                disabled={triggerMutation.isPending}
              >
                <PlayIcon className="mr-1 h-3.5 w-3.5" />
                立即执行
              </Button>
            </div>
            <CardDescription>{job.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 text-sm">
              {editingId === job.id ? (
                <div className="flex items-center gap-2">
                  <Select
                    defaultValue={String(job.intervalMs ?? INTERVAL_OPTIONS[3].value)}
                    onValueChange={(v) => updateMutation.mutate({ jobId: job.id, intervalMs: Number(v) })}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>取消</Button>
                </div>
              ) : (
                <>
                  <div>
                    <span className="text-muted-foreground">执行间隔：</span>
                    <span className="font-medium cursor-pointer hover:underline" onClick={() => setEditingId(job.id)}>
                      {formatInterval(job.intervalMs)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">下次执行：</span>
                    <span>{formatTime(job.nextRunAt)}</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      {jobs.length === 0 && (
        <div className="text-sm text-muted-foreground py-8 text-center">暂无定时任务</div>
      )}
    </div>
  );
}

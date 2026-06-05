import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TaskVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button } from "@magi/ui/components/button";
import { ArrowLeftIcon } from "lucide-react";
import { TaskDetailContent } from "@/features/dashboard/tasks/task-detail-content";

export const Route = createFileRoute("/dashboard/tasks/$taskId")({
  component: TaskDetailPage,
});

function TaskDetailPage() {
  const { taskId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () =>
      apiClient<{ success: boolean; data: TaskVo }>(`/tasks/${taskId}`),
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      if (task?.status === "pending" || task?.status === "running") return 3000;
      return false;
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => apiClient<{ success: boolean; data: { retried: boolean; newTaskId?: string } }>(`/tasks/${taskId}/retry`, { method: "POST" }),
    onSuccess: (res) => {
      if (res.data?.newTaskId) {
        navigate({ to: "/dashboard/tasks/$taskId", params: { taskId: res.data.newTaskId } });
      } else {
        queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiClient<{ success: boolean }>(`/tasks/${taskId}/cancel`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task", taskId] }),
  });

  const task = data?.data;

  if (isLoading) {
    return <div className="text-muted-foreground py-8 text-center">加载中...</div>;
  }

  if (!task) {
    return <div className="text-destructive py-8 text-center">任务未找到</div>;
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/dashboard/tasks" })} aria-label="返回">
          <ArrowLeftIcon className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">任务详情</h1>
      </div>

      <TaskDetailContent
        task={task}
        onRetry={() => retryMutation.mutate()}
        onCancel={() => cancelMutation.mutate()}
        retryPending={retryMutation.isPending}
        cancelPending={cancelMutation.isPending}
      />
    </>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TaskVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { Button, Result } from "antd";
import { TaskDetailContent } from "@/features/dashboard/tasks/task-detail-content";
import { PageHeader, PageStack } from "@/components/page-layout";
import { PageSkeleton } from "@/components/page-skeleton";

export const Route = createFileRoute("/dashboard/tasks/$taskId")({
  component: TaskDetailPage,
});

interface Envelope<T> {
  success: boolean;
  data: T;
}

function TaskDetailPage() {
  const { taskId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => apiClient<Envelope<TaskVo>>(`/tasks/${taskId}`),
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      if (task?.status === "pending" || task?.status === "running") return 2000;
      return false;
    },
  });

  const retryMutation = useMutation({
    mutationFn: () =>
      apiClient<Envelope<{ retried: boolean; newTaskId?: string }>>(
        `/tasks/${taskId}/retry`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      ),
    onSuccess: (res) => {
      if (res.data?.newTaskId) {
        navigate({
          to: "/dashboard/tasks/$taskId",
          params: { taskId: res.data.newTaskId },
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiClient<Envelope<boolean>>(`/tasks/${taskId}/cancel`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["task", taskId] }),
  });

  const task = data?.data;

  if (isLoading) {
    return <PageSkeleton description="正在加载任务详情…" />;
  }

  if (isError) {
    return (
      <Result
        status="error"
        title="任务详情加载失败"
        extra={
          <Button type="primary" onClick={() => void refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  if (!task) {
    return (
      <Result
        status="404"
        title="任务未找到"
        extra={
          <Button onClick={() => navigate({ to: "/dashboard/tasks" })}>
            返回任务列表
          </Button>
        }
      />
    );
  }

  return (
    <PageStack>
      <PageHeader
        title="任务详情"
        description="查看任务执行进度、日志与失败原因"
      />
      <TaskDetailContent
        task={task}
        onRetry={() => retryMutation.mutate()}
        onCancel={() => cancelMutation.mutate()}
        retryPending={retryMutation.isPending}
        cancelPending={cancelMutation.isPending}
      />
    </PageStack>
  );
}

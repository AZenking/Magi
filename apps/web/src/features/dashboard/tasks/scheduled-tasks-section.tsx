import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import {
  Badge,
  Button,
  Card,
  Empty,
  Flex,
  Result,
  Select,
  Spin,
  Switch,
  Tag,
  Typography,
  theme,
} from "antd";
import { useFeedback } from "@/lib/feedback";
import {
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import type {
  OverlapPolicy,
  SaveScheduleRequest,
  ScheduledJobVo,
} from "@magi/types";

/** API envelope (contracts/common.md). */
interface Envelope<T> {
  success: boolean;
  data: T;
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

/** Forward-compatible overlap policy options (currently skip-only). */
const OVERLAP_OPTIONS: { label: string; value: OverlapPolicy }[] = [
  { label: "跳过 (skip)", value: "skip" },
];

/** Common time zones surfaced in the editor. */
const TIMEZONE_OPTIONS = [
  { label: "Asia/Shanghai (UTC+8)", value: "Asia/Shanghai" },
  { label: "Asia/Hong_Kong (UTC+8)", value: "Asia/Hong_Kong" },
  { label: "Asia/Tokyo (UTC+9)", value: "Asia/Tokyo" },
  { label: "UTC", value: "UTC" },
  { label: "Europe/London", value: "Europe/London" },
  { label: "America/New_York", value: "America/New_York" },
];

function formatInterval(ms: number | null | undefined): string {
  if (!ms) return "-";
  if (ms < 3_600_000) return `每 ${ms / 60_000} 分钟`;
  if (ms < 86_400_000) return `每 ${ms / 3_600_000} 小时`;
  return `每 ${ms / 86_400_000} 天`;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Map lastStatus wire value to a Tag color for at-a-glance reading. */
function lastStatusColor(status: string | null | undefined): string {
  switch (status) {
    case "succeeded":
    case "success":
      return "success";
    case "failed":
      return "error";
    case "cancelled":
      return "default";
    case "running":
      return "processing";
    default:
      return "default";
  }
}

/**
 * Draft shape — a complete, editable copy of the schedule fields the user can
 * mutate locally. Save commits the whole draft; Cancel discards it.
 */
interface ScheduleDraft {
  enabled: boolean;
  intervalMs: number;
  timeZone: string;
  overlapPolicy: OverlapPolicy;
}

function toDraft(job: ScheduledJobVo): ScheduleDraft {
  return {
    enabled: job.enabled,
    intervalMs: job.schedule.intervalMs ?? INTERVAL_OPTIONS[3]!.value,
    timeZone: job.timeZone,
    overlapPolicy: job.overlapPolicy,
  };
}

export function ScheduledTasksSection() {
  const { message } = useFeedback();
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["scheduled-jobs"],
    queryFn: async () => {
      const res = await apiClient<Envelope<ScheduledJobVo[]>>(
        "/tasks/scheduled",
      );
      return res.data;
    },
    staleTime: 10_000,
  });

  const triggerMutation = useMutation({
    mutationFn: async (jobId: string) =>
      apiClient<Envelope<{ taskId: string }>>(
        `/tasks/scheduled/${jobId}/trigger`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      ),
    onSuccess: () => {
      message.success("任务已触发");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err) => message.error(`触发失败：${err.message}`),
  });

  const saveMutation = useMutation({
    mutationFn: async (input: {
      jobId: string;
      version: number;
      body: SaveScheduleRequest;
    }) =>
      apiClient<Envelope<ScheduledJobVo>>(
        `/tasks/scheduled/${input.jobId}`,
        {
          method: "PATCH",
          body: input.body,
          headers: { "If-Match": `"${input.version}"` },
        },
      ),
    onSuccess: () => {
      message.success("已保存");
      setEditingId(null);
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["scheduled-jobs"] });
    },
    onError: (err) => message.error(`保存失败：${err.message}`),
  });

  // Reset transient state if the underlying list refetches away from us.
  useEffect(() => {
    if (editingId && !data?.some((j) => j.id === editingId)) {
      setEditingId(null);
      setDraft(null);
    }
  }, [editingId, data]);

  if (isLoading) return <Spin description="加载定时任务…" />;
  if (error) {
    return (
      <Result
        status="error"
        title="定时任务加载失败"
        subTitle={error.message}
        extra={<Button onClick={() => void refetch()}>重试</Button>}
      />
    );
  }

  const jobs = data ?? [];

  function startEdit(job: ScheduledJobVo) {
    setEditingId(job.id);
    setDraft(toDraft(job));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function saveEdit(job: ScheduledJobVo) {
    if (!draft) return;
    saveMutation.mutate({
      jobId: job.id,
      version: job.version,
      body: {
        enabled: draft.enabled,
        schedule: { type: "interval", intervalMs: draft.intervalMs },
        timeZone: draft.timeZone,
        overlapPolicy: draft.overlapPolicy,
      },
    });
  }

  return (
    <Flex vertical gap={token.marginMD}>
      {jobs.map((job) => {
        const isEditing = editingId === job.id;
        const isTriggering = triggerMutation.isPending &&
          triggerMutation.variables === job.id;
        const isSaving = saveMutation.isPending &&
          saveMutation.variables?.jobId === job.id;

        return (
          <Card
            key={job.id}
            title={
              <Flex align="center" gap={token.marginXS}>
                <span>{job.name}</span>
                <Tag color={job.enabled ? "blue" : undefined}>
                  {job.enabled ? "已启用" : "已禁用"}
                </Tag>
                {job.lastStatus && (
                  <Tag color={lastStatusColor(job.lastStatus)}>
                    上次：{job.lastStatus}
                  </Tag>
                )}
              </Flex>
            }
            extra={
              <Button
                size="small"
                onClick={() => triggerMutation.mutate(job.id)}
                loading={isTriggering}
                icon={<PlayCircleOutlined />}
              >
                立即执行
              </Button>
            }
          >
            <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
              {job.description}
            </Typography.Paragraph>

            {isEditing && draft ? (
              <Flex vertical gap={token.marginMD} style={{ marginTop: token.marginMD }}>
                <Flex align="center" gap={token.marginSM}>
                  <Typography.Text type="secondary">启用：</Typography.Text>
                  <Switch
                    checked={draft.enabled}
                    onChange={(enabled) =>
                      setDraft((prev) => (prev ? { ...prev, enabled } : prev))
                    }
                  />
                </Flex>
                <Flex align="center" gap={token.marginSM} wrap>
                  <Typography.Text type="secondary">执行间隔：</Typography.Text>
                  <Select
                    value={draft.intervalMs}
                    onChange={(intervalMs) =>
                      setDraft((prev) =>
                        prev ? { ...prev, intervalMs } : prev,
                      )
                    }
                    options={INTERVAL_OPTIONS}
                    aria-label="执行间隔"
                    style={{ width: 160 }}
                  />
                </Flex>
                <Flex align="center" gap={token.marginSM} wrap>
                  <Typography.Text type="secondary">时区：</Typography.Text>
                  <Select
                    value={draft.timeZone}
                    onChange={(timeZone) =>
                      setDraft((prev) => (prev ? { ...prev, timeZone } : prev))
                    }
                    options={TIMEZONE_OPTIONS}
                    aria-label="时区"
                    style={{ width: 220 }}
                    showSearch
                  />
                </Flex>
                <Flex align="center" gap={token.marginSM} wrap>
                  <Typography.Text type="secondary">重叠策略：</Typography.Text>
                  <Select
                    value={draft.overlapPolicy}
                    onChange={(overlapPolicy: OverlapPolicy) =>
                      setDraft((prev) =>
                        prev ? { ...prev, overlapPolicy } : prev,
                      )
                    }
                    options={OVERLAP_OPTIONS}
                    aria-label="重叠策略"
                    style={{ width: 160 }}
                  />
                </Flex>
                <Flex gap={token.marginXS}>
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={isSaving}
                    onClick={() => saveEdit(job)}
                  >
                    保存
                  </Button>
                  <Button icon={<CloseOutlined />} onClick={cancelEdit}>
                    取消
                  </Button>
                </Flex>
              </Flex>
            ) : (
              <Flex
                align="center"
                wrap
                gap={token.marginLG}
                style={{ marginTop: token.marginMD }}
              >
                <ReadOnlyField
                  label="执行间隔"
                  value={formatInterval(job.schedule.intervalMs)}
                />
                <ReadOnlyField
                  label="时区"
                  value={job.timeZone}
                />
                <ReadOnlyField
                  label="重叠策略"
                  value={job.overlapPolicy}
                />
                <ReadOnlyField
                  label="下次执行"
                  value={formatTime(job.nextRunAt)}
                />
                <ReadOnlyField
                  label="上次执行"
                  value={formatTime(job.lastRunAt)}
                />
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => startEdit(job)}
                >
                  编辑
                </Button>
              </Flex>
            )}

            {job.lastSkipReason && (
              <div style={{ marginTop: token.marginSM }}>
                <Badge status="warning" text={job.lastSkipReason} />
              </div>
            )}
          </Card>
        );
      })}
      {jobs.length === 0 && <Empty description="暂无定时任务" />}
    </Flex>
  );
}

/** Compact read-only label + value, used in the non-editing card layout. */
function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const { token } = theme.useToken();
  return (
    <Flex align="baseline" gap={token.marginXXS}>
      <Typography.Text type="secondary">{label}：</Typography.Text>
      <Typography.Text>{value}</Typography.Text>
    </Flex>
  );
}

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Flex,
  InputNumber,
  Select,
  Skeleton,
  Typography,
  theme,
} from "antd";
import type { FailoverMode, FailoverPolicy } from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";

const modeOptions: Array<{ value: FailoverMode; label: string; hint: string }> =
  [
    {
      value: "manual_only",
      label: "仅手动",
      hint: "不自动切换，全部由运营手动处理。",
    },
    {
      value: "auto_keep_fallback",
      label: "自动切换至备源（保留）",
      hint: "主源连续失败达到阈值后切换到备源，即使主源恢复也保留在备源。",
    },
    {
      value: "auto_restore_primary",
      label: "自动切换并回切主源",
      hint: "主源失败时切到备源，主源恢复达到阈值后自动切回主源。",
    },
  ];

interface ChannelFailoverPolicyProps {
  channelId: string;
}

/**
 * T121: failover policy editor. Reads the current policy, lets the operator
 * adjust mode + thresholds in a controlled form, and writes back with If-Match
 * on the policy version. Save stays disabled until the working copy diverges
 * from the server snapshot. Idempotency-Key guards the retry-safe PUT.
 */
export function ChannelFailoverPolicy({ channelId }: ChannelFailoverPolicyProps) {
  const { token } = theme.useToken();
  const { message } = useFeedback();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["channel-failover-policy", channelId],
    queryFn: () =>
      apiClient<{
        success: boolean;
        data: FailoverPolicy & {
          canonicalChannelId: string;
          version: number;
        };
      }>(`/output/channels/${channelId}/failover-policy`),
  });

  const server = data?.data;
  const version = server?.version;

  const [form, setForm] = useState<FailoverPolicy>({
    mode: "manual_only",
    failureThreshold: 3,
    recoveryThreshold: 2,
    cooldownSeconds: 60,
  });

  useEffect(() => {
    if (server) {
      setForm({
        mode: server.mode,
        failureThreshold: server.failureThreshold,
        recoveryThreshold: server.recoveryThreshold,
        cooldownSeconds: server.cooldownSeconds,
      });
    }
  }, [server]);

  const dirty =
    !!server &&
    (server.mode !== form.mode ||
      server.failureThreshold !== form.failureThreshold ||
      server.recoveryThreshold !== form.recoveryThreshold ||
      server.cooldownSeconds !== form.cooldownSeconds);

  const reset = () => {
    if (server) {
      setForm({
        mode: server.mode,
        failureThreshold: server.failureThreshold,
        recoveryThreshold: server.recoveryThreshold,
        cooldownSeconds: server.cooldownSeconds,
      });
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiClient<{
        success: boolean;
        data: FailoverPolicy & { version: number };
      }>(`/output/channels/${channelId}/failover-policy`, {
        method: "PUT",
        headers: {
          "If-Match": `"${version ?? 1}"`,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: form,
      });
    },
    onSuccess: () => {
      message.success("故障转移策略已保存");
      void refetch();
    },
    onError: (err) => message.error(`保存失败：${err.message}`),
  });

  if (isLoading) {
    return <Skeleton active paragraph={{ rows: 3 }} />;
  }
  if (isError || !server) {
    return (
      <Alert
        type="error"
        showIcon
        title="策略加载失败"
        action={
          <Button size="small" onClick={() => void refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  const modeMeta = modeOptions.find((o) => o.value === form.mode);

  return (
    <Flex vertical gap={token.marginMD}>
      <div>
        <Typography.Text type="secondary">模式</Typography.Text>
        <Select<FailoverMode>
          value={form.mode}
          onChange={(v) => setForm((f) => ({ ...f, mode: v }))}
          options={modeOptions}
          style={{ width: "100%", marginTop: token.marginXXS }}
          disabled={saveMutation.isPending}
        />
        {modeMeta && (
          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: token.marginXS, marginBottom: 0 }}
          >
            {modeMeta.hint}
          </Typography.Paragraph>
        )}
      </div>

      <Flex gap={token.marginMD} wrap>
        <PolicyField
          label="连续失败阈值"
          hint="主源连续失败多少次后触发切换。"
        >
          <InputNumber
            min={1}
            max={100}
            value={form.failureThreshold}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                failureThreshold: typeof v === "number" ? v : f.failureThreshold,
              }))
            }
            disabled={saveMutation.isPending}
            style={{ width: "100%" }}
          />
        </PolicyField>
        <PolicyField
          label="连续恢复阈值"
          hint="仅对「自动回切主源」模式生效：主源连续成功多少次后切回。"
        >
          <InputNumber
            min={1}
            max={100}
            value={form.recoveryThreshold}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                recoveryThreshold:
                  typeof v === "number" ? v : f.recoveryThreshold,
              }))
            }
            disabled={saveMutation.isPending}
            style={{ width: "100%" }}
          />
        </PolicyField>
        <PolicyField
          label="冷却时间（秒）"
          hint="两次切换之间的最小间隔，避免频繁抖动。"
        >
          <InputNumber
            min={0}
            max={86400}
            value={form.cooldownSeconds}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                cooldownSeconds:
                  typeof v === "number" ? v : f.cooldownSeconds,
              }))
            }
            disabled={saveMutation.isPending}
            style={{ width: "100%" }}
          />
        </PolicyField>
      </Flex>

      <Flex justify="flex-end" gap={token.marginXS}>
        <Button onClick={reset} disabled={!dirty || saveMutation.isPending}>
          重置
        </Button>
        <Button
          type="primary"
          loading={saveMutation.isPending}
          disabled={!dirty}
          onClick={() => saveMutation.mutate()}
        >
          保存策略
        </Button>
      </Flex>
    </Flex>
  );
}

function PolicyField({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  const { token } = theme.useToken();
  return (
    <Flex vertical gap={token.marginXXS} style={{ flex: 1, minWidth: 160 }}>
      <Typography.Text type="secondary">{label}</Typography.Text>
      {children}
      <Typography.Text
        type="secondary"
        style={{ fontSize: token.fontSizeSM }}
      >
        {hint}
      </Typography.Text>
    </Flex>
  );
}

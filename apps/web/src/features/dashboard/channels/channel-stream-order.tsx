import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Button,
  Empty,
  Flex,
  List,
  Tag,
  Tooltip,
  Typography,
  theme,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  StarFilled,
  StarOutlined,
} from "@ant-design/icons";
import type {
  CanonicalChannelVo,
  ChannelStreamVo,
  StreamOrderItem,
} from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";

const healthStatusMap: Record<string, { label: string; color?: string }> = {
  online: { label: "在线", color: "success" },
  offline: { label: "离线", color: "error" },
  degraded: { label: "降级", color: "warning" },
  unknown: { label: "未知" },
};

interface RowState {
  id: string;
  stream: ChannelStreamVo;
  isPrimary: boolean;
  eligibleForFailover: boolean;
}

/**
 * Build the editable row state from server streams, preserving the primary
 * marker and seeding `eligibleForFailover` (true by default for non-primary
 * streams, since the backend treats every active stream as a candidate).
 */
function toRowState(streams: ChannelStreamVo[]): RowState[] {
  return streams.map((stream) => ({
    id: stream.id,
    stream,
    isPrimary: stream.isPrimary,
    // The legacy ChannelStreamVo has no eligibleForFailover field; default
    // every non-primary stream to eligible so the failover pool is the full
    // ordered list unless the operator explicitly disables a row.
    eligibleForFailover: !stream.isPrimary,
  }));
}

/**
 * Validate against the stream-order contract rules (channels.md):
 * positions contiguous from 0 and exactly one primary (when non-empty).
 * Returns an error message or null when valid.
 */
function validateOrder(rows: RowState[]): string | null {
  if (rows.length === 0) return null;
  const primaryCount = rows.filter((r) => r.isPrimary).length;
  if (primaryCount !== 1) {
    return `必须有且仅有一个主源（当前 ${primaryCount} 个）。`;
  }
  return null;
}

interface ChannelStreamOrderProps {
  channel: Pick<CanonicalChannelVo, "id" | "version">;
  streams: ChannelStreamVo[];
  onSaved: () => void;
}

/**
 * T121: reorderable stream list. Positions are derived from array order so the
 * up/down buttons are the single source of truth; primary + eligibility are
 * per-row toggles. Save is disabled until the local order differs from the
 * server snapshot or the validation rules are violated.
 */
export function ChannelStreamOrder({
  channel,
  streams,
  onSaved,
}: ChannelStreamOrderProps) {
  const { token } = theme.useToken();
  const { message } = useFeedback();
  const [rows, setRows] = useState<RowState[]>(() => toRowState(streams));

  // Re-sync local state when the server snapshot changes (e.g. after a
  // create/delete elsewhere on the detail page invalidates the query).
  useEffect(() => {
    setRows(toRowState(streams));
  }, [streams]);

  const baseline = useMemo(() => toRowState(streams), [streams]);

  const dirty = useMemo(() => {
    if (rows.length !== baseline.length) return true;
    return rows.some((row, i) => {
      const b = baseline[i];
      if (!b) return true;
      return (
        b.id !== row.id ||
        b.isPrimary !== row.isPrimary ||
        b.eligibleForFailover !== row.eligibleForFailover
      );
    });
  }, [rows, baseline]);

  const validationError = useMemo(() => validateOrder(rows), [rows]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      const a = next[index];
      const b = next[target];
      if (!a || !b) return prev;
      next[index] = b;
      next[target] = a;
      return next;
    });
  };

  const setPrimary = (id: string) => {
    setRows((prev) =>
      prev.map((r) => ({ ...r, isPrimary: r.id === id })),
    );
  };

  const toggleEligible = (id: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, eligibleForFailover: !r.eligibleForFailover } : r,
      ),
    );
  };

  const reset = () => setRows(baseline);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: { streams: StreamOrderItem[] } = {
        streams: rows.map((row, position) => ({
          id: row.id,
          position,
          isPrimary: row.isPrimary,
          eligibleForFailover: row.eligibleForFailover,
        })),
      };
      return apiClient<{
        success: boolean;
        data: { version: number };
      }>(`/output/channels/${channel.id}/streams/order`, {
        method: "PUT",
        headers: {
          "If-Match": `"${channel.version ?? 1}"`,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body,
      });
    },
    onSuccess: () => {
      message.success("播放源顺序已保存");
      onSaved();
    },
    onError: (err) => message.error(`保存失败：${err.message}`),
  });

  if (streams.length === 0) {
    return <Empty description="暂无播放源，请新增后再调整顺序" />;
  }

  return (
    <Flex vertical gap={token.marginSM} style={{ minWidth: 0 }}>
      <List
        dataSource={rows}
        renderItem={(row, index) => {
          const health =
            healthStatusMap[row.stream.healthStatus] ?? {
              label: row.stream.healthStatus,
            };
          return (
            <List.Item key={row.id}>
              <Flex
                align="center"
                gap={token.marginSM}
                wrap
                style={{ width: "100%" }}
              >
                <Flex
                  align="center"
                  justify="center"
                  style={{
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    borderRadius: token.borderRadiusSM,
                    background: token.colorFillAlter,
                    color: token.colorTextSecondary,
                    fontSize: token.fontSizeSM,
                  }}
                  aria-label={`排序位置 ${index + 1}`}
                >
                  {index + 1}
                </Flex>
                <Flex vertical gap={token.marginXXS} style={{ minWidth: 0, flex: 1 }}>
                  <Flex wrap gap={token.marginXS} align="center">
                    <Typography.Text strong ellipsis style={{ minWidth: 0 }}>
                      {row.stream.m3uSourceName ?? row.stream.sourceChannelName ?? "自定义源"}
                    </Typography.Text>
                    <Tag color={health.color}>{health.label}</Tag>
                    {row.stream.consecutiveFailures > 0 && (
                      <Tag>连续失败 {row.stream.consecutiveFailures}</Tag>
                    )}
                  </Flex>
                  <Typography.Text code ellipsis type="secondary">
                    {row.stream.streamUrl}
                  </Typography.Text>
                </Flex>
                <Flex align="center" gap={token.marginXS} wrap>
                  <Tooltip
                    title={
                      row.isPrimary ? "当前主源" : "设为主源（唯一）"
                    }
                  >
                    <Button
                      type="text"
                      icon={row.isPrimary ? <StarFilled /> : <StarOutlined />}
                      aria-label={row.isPrimary ? "主源" : "设为主源"}
                      aria-pressed={row.isPrimary}
                      disabled={row.isPrimary}
                      onClick={() => setPrimary(row.id)}
                      style={
                        row.isPrimary
                          ? { color: token.colorPrimary }
                          : undefined
                      }
                    />
                  </Tooltip>
                  <Tooltip
                    title={
                      row.eligibleForFailover
                        ? "参与自动故障转移"
                        : "不参与自动故障转移"
                    }
                  >
                    <Button
                      type={row.eligibleForFailover ? "primary" : "default"}
                      size="small"
                      aria-pressed={row.eligibleForFailover}
                      onClick={() => toggleEligible(row.id)}
                    >
                      可故障转移
                    </Button>
                  </Tooltip>
                  <Flex vertical gap={0}>
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowUpOutlined />}
                      aria-label="上移"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowDownOutlined />}
                      aria-label="下移"
                      disabled={index === rows.length - 1}
                      onClick={() => move(index, 1)}
                    />
                  </Flex>
                </Flex>
              </Flex>
            </List.Item>
          );
        }}
      />

      {validationError && (
        <Typography.Text type="danger">{validationError}</Typography.Text>
      )}
      <Flex justify="flex-end" gap={token.marginXS}>
        <Button onClick={reset} disabled={!dirty || saveMutation.isPending}>
          重置
        </Button>
        <Button
          type="primary"
          loading={saveMutation.isPending}
          disabled={!dirty || !!validationError}
          onClick={() => saveMutation.mutate()}
        >
          保存顺序
        </Button>
      </Flex>
    </Flex>
  );
}

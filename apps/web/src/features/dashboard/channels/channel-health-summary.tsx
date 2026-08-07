/**
 * ChannelHealthSummary (009-m3u-control-plane T042).
 *
 * Surfaces the source-level vs line-level health distinction + the latest
 * failover event. Renders next to ChannelFailoverPolicy on the channel detail
 * page so operators can see "why did the line switch?" without leaving the page.
 *
 * antd v6 visual language: one card, semantic colors, 4px grid spacing.
 */
import { useQuery } from "@tanstack/react-query";
import { Alert, Card, Descriptions, Empty, Space, Tag, Timeline, Typography } from "antd";
import { apiClient } from "@/services/api";

const { Text } = Typography;

interface Envelope<T> {
  success: boolean;
  data: T;
}

interface FailoverEvent {
  id: string;
  canonicalChannelId: string;
  previousStreamId: string | null;
  nextStreamId: string;
  trigger: "auto_failure_threshold" | "auto_recovery" | "manual";
  reason: string;
  observedAt: string;
}

interface StreamHealthRow {
  id: string;
  healthStatus: "online" | "offline" | "degraded" | "unknown";
  consecutiveFailures: number;
  consecutiveSuccesses?: number;
  failingSince?: string | null;
  cooldownUntil?: string | null;
  missingSince?: string | null;
  isPrimary: boolean;
  origin?: "source" | "manual";
}

const triggerLabel: Record<FailoverEvent["trigger"], string> = {
  auto_failure_threshold: "失败阈值触发",
  auto_recovery: "自动恢复",
  manual: "运营手动",
};

const triggerColor: Record<FailoverEvent["trigger"], string> = {
  auto_failure_threshold: "red",
  auto_recovery: "green",
  manual: "blue",
};

const healthColor: Record<StreamHealthRow["healthStatus"], string> = {
  online: "green",
  offline: "red",
  degraded: "orange",
  unknown: "default",
};

export function ChannelHealthSummary({ channelId }: { channelId: string }) {
  const eventsQuery = useQuery({
    queryKey: ["channel-failover-events", channelId],
    queryFn: async () => {
      const res = await apiClient<Envelope<FailoverEvent[]>>(
        `/output/channels/${channelId}/failover-events`,
      );
      return res.data;
    },
    refetchInterval: 15000,
  });

  const streamsQuery = useQuery({
    queryKey: ["channel-streams-health", channelId],
    queryFn: async () => {
      const res = await apiClient<Envelope<{ items: StreamHealthRow[] }>>(
        `/output/channels/${channelId}/streams`,
      );
      return res.data;
    },
  });

  const events = eventsQuery.data ?? [];
  const streams = streamsQuery.data?.items ?? [];
  const sourceLines = streams.filter((s) => s.origin !== "manual");
  const manualLines = streams.filter((s) => s.origin === "manual");
  const missingLines = streams.filter((s) => s.missingSince);

  const latestEvent = events[0];

  return (
    <Card title="健康与故障切换" size="small">
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="来源线路">
            {sourceLines.length} 条
            <Tag
              color={
                sourceLines.every((s) => s.healthStatus === "online")
                  ? "green"
                  : sourceLines.some((s) => s.healthStatus === "offline")
                    ? "red"
                    : "orange"
              }
              style={{ marginLeft: 8 }}
            >
              {sourceLines.every((s) => s.healthStatus === "online")
                ? "全部在线"
                : sourceLines.some((s) => s.healthStatus === "offline")
                  ? "存在离线"
                  : "存在降级"}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="手动线路">
            {manualLines.length} 条
            <Tag color="blue" style={{ marginLeft: 8 }}>
              不受来源同步影响
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="缺失线路">
            {missingLines.length} 条
            {missingLines.length > 0 && (
              <Text type="secondary" style={{ marginLeft: 8 }}>
                已退出输出,30 天内可恢复
              </Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="最近切换原因">
            {latestEvent ? (
              <Space size={4}>
                <Tag color={triggerColor[latestEvent.trigger]}>
                  {triggerLabel[latestEvent.trigger]}
                </Tag>
                <Text type="secondary">{latestEvent.reason}</Text>
              </Space>
            ) : (
              <Text type="secondary">无自动切换记录</Text>
            )}
          </Descriptions.Item>
        </Descriptions>

        {streams.length > 0 && (
          <div>
            <Typography.Title level={5}>线路健康</Typography.Title>
            <Space direction="vertical" size={4} style={{ width: "100%" }}>
              {streams.map((s) => (
                <div key={s.id}>
                  <Tag color={healthColor[s.healthStatus]}>
                    {s.healthStatus}
                  </Tag>
                  {s.isPrimary && (
                    <Tag color="gold" style={{ marginLeft: 4 }}>
                      主
                    </Tag>
                  )}
                  {s.origin === "manual" && (
                    <Tag color="blue" style={{ marginLeft: 4 }}>
                      手动
                    </Tag>
                  )}
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    连续失败 {s.consecutiveFailures}
                    {s.consecutiveSuccesses != null && ` · 连续成功 ${s.consecutiveSuccesses}`}
                    {s.failingSince && ` · 自 ${new Date(s.failingSince).toLocaleString()} 起降级`}
                    {s.cooldownUntil && ` · 冷却至 ${new Date(s.cooldownUntil).toLocaleTimeString()}`}
                    {s.missingSince && ` · 缺失自 ${new Date(s.missingSince).toLocaleDateString()}`}
                  </Text>
                </div>
              ))}
            </Space>
          </div>
        )}

        {events.length > 0 ? (
          <div>
            <Typography.Title level={5}>最近切换事件</Typography.Title>
            <Timeline
              items={events.slice(0, 5).map((e) => ({
                color: triggerColor[e.trigger],
                children: (
                  <Space direction="vertical" size={2}>
                    <Space size={6}>
                      <Tag color={triggerColor[e.trigger]}>
                        {triggerLabel[e.trigger]}
                      </Tag>
                      <Text type="secondary">
                        {new Date(e.observedAt).toLocaleString()}
                      </Text>
                    </Space>
                    <Text>
                      <Text code>{e.previousStreamId?.slice(0, 8) ?? "—"}</Text>
                      {" → "}
                      <Text code>{e.nextStreamId.slice(0, 8)}</Text>
                    </Text>
                    <Text type="secondary">{e.reason}</Text>
                  </Space>
                ),
              }))}
            />
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="尚未触发自动故障切换"
          />
        )}

        {eventsQuery.error && (
          <Alert
            type="warning"
            showIcon
            message="无法加载切换事件"
            description={
              eventsQuery.error instanceof Error
                ? eventsQuery.error.message
                : "请稍后重试"
            }
          />
        )}
      </Space>
    </Card>
  );
}

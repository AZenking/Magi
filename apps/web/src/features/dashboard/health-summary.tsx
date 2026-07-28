import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { Card, Result, theme } from "antd";
import { StatisticCard } from "@ant-design/pro-components";
import { DashboardOutlined } from "@ant-design/icons";

interface HealthSummary {
  totalStreams: number;
  online: number;
  offline: number;
  degraded: number;
  unknown: number;
  avgResponseTime: number | null;
  totalChannels: number;
  activeChannels: number;
  degradedChannels: number;
  unavailableChannels: number;
}

export function HealthSummaryCards() {
  const { token } = theme.useToken();
  const { data, isError, refetch } = useQuery({
    queryKey: ["health-summary"],
    queryFn: () =>
      apiClient<{ success: boolean; data: HealthSummary }>(
        "/dashboard/health-summary",
      ),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const h = data?.data;
  if (isError) {
    return (
      <Result
        status="error"
        title="健康状态加载失败"
        extra={<a onClick={() => void refetch()}>重试</a>}
      />
    );
  }

  if (!h) return null;

  return (
    <Card
      title={
        <>
          <DashboardOutlined style={{ marginRight: token.marginXS }} />
          流健康状态
        </>
      }
    >
      <StatisticCard.Group direction={"row" as never}>
        <StatisticCard
          statistic={{ title: "总流数", value: h.totalStreams, description: "" }}
        />
        <StatisticCard
          statistic={{
            title: "在线",
            value: h.online,
            description: "",
            valueStyle: { color: token.colorSuccess },
          }}
        />
        <StatisticCard
          statistic={{
            title: "离线",
            value: h.offline,
            description: "",
            valueStyle: { color: token.colorError },
          }}
        />
        <StatisticCard
          statistic={{
            title: "降级",
            value: h.degraded,
            description: "",
            valueStyle: { color: token.colorWarning },
          }}
        />
        <StatisticCard
          statistic={{
            title: "未知",
            value: h.unknown,
            description: "",
            valueStyle: { color: token.colorTextSecondary },
          }}
        />
        <StatisticCard
          statistic={{
            title: "平均响应",
            value: h.avgResponseTime != null ? `${h.avgResponseTime}ms` : "-",
            description: "",
          }}
        />
      </StatisticCard.Group>
      <StatisticCard.Group
        direction={"row" as never}
        style={{
          marginTop: token.marginMD,
          paddingTop: token.paddingMD,
          borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
        }}
      >
        <StatisticCard
          statistic={{ title: "输出频道", value: h.totalChannels, description: "" }}
        />
        <StatisticCard
          statistic={{
            title: "正常频道",
            value: h.activeChannels,
            description: "",
            valueStyle: { color: token.colorSuccess },
          }}
        />
        <StatisticCard
          statistic={{
            title: "降级频道",
            value: h.degradedChannels,
            description: "",
            valueStyle: { color: token.colorWarning },
          }}
        />
        <StatisticCard
          statistic={{
            title: "不可用频道",
            value: h.unavailableChannels,
            description: "",
            valueStyle: { color: token.colorError },
          }}
        />
      </StatisticCard.Group>
    </Card>
  );
}

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { Card, Col, Result, Row, Statistic, theme } from "antd";
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
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} lg={4}>
          <HealthStat label="总流数" value={h.totalStreams} />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <HealthStat
            label="在线"
            value={h.online}
            color={token.colorSuccess}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <HealthStat label="离线" value={h.offline} color={token.colorError} />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <HealthStat
            label="降级"
            value={h.degraded}
            color={token.colorWarning}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <HealthStat
            label="未知"
            value={h.unknown}
            color={token.colorTextSecondary}
          />
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <HealthStat
            label="平均响应"
            value={h.avgResponseTime != null ? `${h.avgResponseTime}ms` : "-"}
          />
        </Col>
      </Row>
      <Row
        gutter={[16, 16]}
        style={{
          marginTop: token.marginMD,
          paddingTop: token.paddingMD,
          borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
        }}
      >
        <Col xs={12} sm={6}>
          <HealthStat label="输出频道" value={h.totalChannels} />
        </Col>
        <Col xs={12} sm={6}>
          <HealthStat
            label="正常频道"
            value={h.activeChannels}
            color={token.colorSuccess}
          />
        </Col>
        <Col xs={12} sm={6}>
          <HealthStat
            label="降级频道"
            value={h.degradedChannels}
            color={token.colorWarning}
          />
        </Col>
        <Col xs={12} sm={6}>
          <HealthStat
            label="不可用频道"
            value={h.unavailableChannels}
            color={token.colorError}
          />
        </Col>
      </Row>
    </Card>
  );
}

function HealthStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <Statistic
      title={label}
      value={value}
      styles={{ content: { color, fontSize: 18, fontWeight: 600 } }}
    />
  );
}

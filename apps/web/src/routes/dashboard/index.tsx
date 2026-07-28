import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Flex,
  Result,
  Skeleton,
  Typography,
  theme,
} from "antd";
import { StatisticCard } from "@ant-design/pro-components";
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ProfileOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { apiClient } from "@/services/api";
import { HealthSummaryCards } from "@/features/dashboard/health-summary";
import { OperationsSummary } from "@/features/dashboard/operations-summary";
import { PageHeader, PageStack } from "@/components/page-layout";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

interface DashboardStats {
  m3u: number;
  xmltv: number;
  channels: number;
  programmes: number;
  synced: number;
}

function DashboardPage() {
  const { token } = theme.useToken();
  const {
    data: sourceData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["dashboard-sources"],
    queryFn: () =>
      apiClient<{ success: boolean; data: DashboardStats }>("/dashboard/stats"),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
  const stats = sourceData?.data;
  const pendingItems: Array<{
    title: string;
    desc: string;
    to:
      | "/dashboard/sources/m3u"
      | "/dashboard/sources/xmltv"
      | "/dashboard/epg-matching";
  }> = [];

  if (stats) {
    if (stats.m3u === 0) {
      pendingItems.push({
        title: "尚未配置 M3U 源",
        desc: "输出频道没有可用的播放源数据。",
        to: "/dashboard/sources/m3u",
      });
    }
    if (stats.xmltv === 0) {
      pendingItems.push({
        title: "尚未配置 XMLTV 源",
        desc: "EPG 匹配和节目单暂时无法运行。",
        to: "/dashboard/sources/xmltv",
      });
    }
    if (stats.channels > stats.synced) {
      pendingItems.push({
        title: `${stats.channels - stats.synced} 个频道尚未匹配 EPG`,
        desc: "检查 EPG 匹配结果并处理未匹配或冲突频道。",
        to: "/dashboard/epg-matching",
      });
    }
  }

  if (isError) {
    return (
      <Result
        status="error"
        title="工作台数据加载失败"
        subTitle="请检查服务状态后重试。"
        extra={
          <Button type="primary" onClick={() => void refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  return (
    <PageStack>
      <PageHeader
        title="工作台"
        description="监控数据接入、EPG 匹配进度与输出健康状态"
        actions={
          <Link to="/dashboard/tasks">
            <Button icon={<ProfileOutlined />}>任务中心</Button>
          </Link>
        }
      />

      <StatisticCard.Group>
        {[
          ["数据源", stats ? stats.m3u + stats.xmltv : undefined],
          ["原始频道", stats?.channels],
          ["已匹配频道", stats?.synced],
          ["节目", stats?.programmes],
        ].map(([label, value]) => (
          <StatisticCard
            key={String(label)}
            statistic={{
              title: label as string,
              value: isLoading ? "-" : (value ?? "-"),
              description: "",
            }}
            loading={isLoading}
          />
        ))}
      </StatisticCard.Group>

      <Card
        title="待处理事项"
        extra={
          !isLoading && (
            <Typography.Text type="secondary">
              {pendingItems.length > 0
                ? `${pendingItems.length} 项需要关注`
                : "当前无阻塞项"}
            </Typography.Text>
          )
        }
      >
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 2 }} title={false} />
        ) : pendingItems.length > 0 ? (
          <Flex vertical gap={token.marginMD}>
            {pendingItems.map((item) => (
              <Flex
                key={item.title}
                align="center"
                justify="space-between"
                gap={token.marginMD}
                wrap
              >
                <Flex align="flex-start" gap={token.marginSM}>
                  <WarningOutlined
                    style={{
                      color: token.colorWarning,
                      marginTop: token.marginXXS,
                    }}
                  />
                  <Flex vertical gap={token.marginXXS}>
                    <Typography.Text strong>{item.title}</Typography.Text>
                    <Typography.Text type="secondary">
                      {item.desc}
                    </Typography.Text>
                  </Flex>
                </Flex>
                <Link to={item.to}>
                  <Button type="link" icon={<ArrowRightOutlined />}>
                    处理
                  </Button>
                </Link>
              </Flex>
            ))}
          </Flex>
        ) : (
          <Flex align="center" gap={token.marginSM}>
            <CheckCircleOutlined style={{ color: token.colorSuccess }} />
            <Typography.Text>
              数据链路已配置完成，请继续关注下方播放源与输出频道健康状态。
            </Typography.Text>
          </Flex>
        )}
      </Card>

      <HealthSummaryCards />

      {/* T123: operations summary (freshness, coverage, task anomalies, issues). */}
      <OperationsSummary />
    </PageStack>
  );
}

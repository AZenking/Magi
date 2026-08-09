import { createFileRoute } from "@tanstack/react-router";
import { Alert, Button, Card, Flex, Space, Spin, Tag, Typography } from "antd";
import { API_BASE } from "@/services/config";
import { PageHeader, PageStack } from "@/components/page-layout";
import { OutputGrantManagement } from "@/features/dashboard/output/output-grant-dialog";

export const Route = createFileRoute("/dashboard/output-addresses")({
  component: OutputAddressesPage,
  pendingComponent: () => (
    <PageStack>
      <Card size="small">
        <Spin tip="加载输出地址…" />
      </Card>
    </PageStack>
  ),
  errorComponent: (props: { error: Error; reset?: () => void }) => (
    <PageStack>
      <Alert
        type="error"
        showIcon
        title="加载失败"
        description={
          <Space size={8}>
            <Typography.Text>
              {props.error?.message ?? "无法读取输出资格或发布状态。"}
            </Typography.Text>
            {props.reset && (
              <Button type="primary" size="small" onClick={props.reset}>
                重试
              </Button>
            )}
          </Space>
        }
      />
    </PageStack>
  ),
});

const endpoints = [
  { name: "Legacy M3U", path: "/output/m3u", version: "Legacy" },
  { name: "Legacy XMLTV", path: "/output/xmltv", version: "Legacy" },
  { name: "Magi TV M3U", path: "/output/v2/m3u", version: "V2" },
  { name: "Magi TV XMLTV", path: "/output/v2/xmltv", version: "V2" },
] as const;

function OutputAddressesPage() {
  return (
    <PageStack>
      <PageHeader
        title="输出"
        description="管理 M3U/XMLTV 输出地址、播放器授权与最近一次发布状态"
      />
      <Alert
        type="info"
        showIcon
        title="接入规则"
        description="传统播放器使用下方的可撤销资格 URL;Android TV 继续使用既有 Open API 设备令牌。"
      />
      {/* 009-m3u-control-plane T052/T056: grant + publication management */}
      <OutputGrantManagement />
      <Flex vertical gap={16}>
        <Typography.Title level={5}>服务端固定端点（管理员预览）</Typography.Title>
        {endpoints.map((endpoint) => {
          const url = new URL(endpoint.path, API_BASE).toString();
          return (
            <Card
              key={endpoint.path}
              size="small"
              title={
                <Flex gap={8} align="center">
                  <span>{endpoint.name}</span>
                  <Tag color={endpoint.version === "V2" ? "blue" : undefined}>
                    {endpoint.version}
                  </Tag>
                  {endpoint.version === "V2" && <Tag color="success">推荐</Tag>}
                </Flex>
              }
            >
              <Typography.Text code copyable={{ text: url }}>
                {url}
              </Typography.Text>
            </Card>
          );
        })}
      </Flex>
    </PageStack>
  );
}

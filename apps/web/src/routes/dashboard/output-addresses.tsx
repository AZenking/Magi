import { createFileRoute } from "@tanstack/react-router";
import { Alert, Card, Flex, Tag, Typography } from "antd";
import { API_BASE } from "@/services/config";
import { PageHeader, PageStack } from "@/components/page-layout";

export const Route = createFileRoute("/dashboard/output-addresses")({
  component: OutputAddressesPage,
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
        title="输出地址"
        description="Legacy 继续兼容现有客户端；Magi TV 固定使用 V2"
      />
      <Alert
        type="info"
        showIcon
        title="Magi TV 接入规则"
        description="同时配置 V2 M3U 与 V2 XMLTV。两者使用相同的稳定 magi:canonicalChannelId，不会因上游 EPG 来源切换而变化。"
      />
      <Flex vertical gap={16}>
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

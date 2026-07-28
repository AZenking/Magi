import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Card, Flex, Tag, Typography, theme } from "antd";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { token } = theme.useToken();

  return (
    <Flex
      component="main"
      vertical
      align="center"
      justify="center"
      gap={token.marginLG}
      style={{ minHeight: "100vh", padding: token.paddingLG }}
    >
      <Flex vertical align="center" gap={token.marginXS}>
        <Typography.Title style={{ margin: 0 }}>MAGI</Typography.Title>
        <Typography.Text type="secondary">
          Personal EPG + Live TV Platform
        </Typography.Text>
      </Flex>

      <Card
        title={
          <Flex align="center" gap={token.marginXS}>
            Quick Start
            <Tag color="blue">v0.1</Tag>
          </Flex>
        }
        extra={<Typography.Text type="secondary">管理后台</Typography.Text>}
      >
        <Flex vertical gap={token.marginMD}>
          <Typography.Text type="secondary">
            进入控制台管理节目单与直播源。
          </Typography.Text>
          <Link to="/dashboard">
            <Button type="primary">开始使用</Button>
          </Link>
        </Flex>
      </Card>
    </Flex>
  );
}

import { Avatar, Button, Dropdown, Flex, Layout, theme } from "antd";
import type { MenuProps } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { signOut } from "@/lib/auth-client";
import { AppBreadcrumb } from "./app-breadcrumb";
import { GlobalTaskStatus } from "./global-task-status";

const { Header } = Layout;

type AppHeaderProps = {
  userName?: string;
};

export function AppHeader({ userName }: AppHeaderProps) {
  const { token } = theme.useToken();
  const displayName = userName ?? "用户";
  const initial = displayName.charAt(0).toUpperCase();

  async function handleLogout() {
    await signOut();
    window.location.href = "/login";
  }

  const menuItems: MenuProps["items"] = [
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "退出登录",
      onClick: handleLogout,
    },
  ];

  return (
    <Header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: token.marginSM,
        padding: `0 ${token.paddingLG}px`,
        background: token.colorBgContainer,
        borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
      }}
    >
      <Flex align="center" style={{ minWidth: 0, overflow: "hidden" }}>
        <AppBreadcrumb />
      </Flex>
      <Flex align="center" gap={token.marginSM}>
        <GlobalTaskStatus />
        <Dropdown menu={{ items: menuItems }} placement="bottomRight">
          <Button
            type="text"
            style={{
              height: token.controlHeightLG,
              paddingInline: token.paddingXS,
            }}
          >
            <Flex align="center" gap={token.marginXS}>
              <Avatar size={28} style={{ backgroundColor: token.colorPrimary }}>
                {initial}
              </Avatar>
              <span>{displayName}</span>
            </Flex>
          </Button>
        </Dropdown>
      </Flex>
    </Header>
  );
}

import { Avatar, Button, Dropdown, Flex, Grid, theme } from "antd";
import type { MenuProps } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { ProLayout } from "@ant-design/pro-components";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { signOut } from "@/lib/auth-client";
import { GlobalTaskStatus } from "./global-task-status";
import { AppBreadcrumb } from "./app-breadcrumb";
import { APP_MENU_ROUTE } from "./app-menu";

type AppLayoutProps = {
  userName?: string;
};

export function AppLayout({ userName }: AppLayoutProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const { token } = theme.useToken();
  const displayName = userName ?? "用户";

  async function handleLogout() {
    await signOut();
    window.location.href = "/login";
  }

  const userMenuItems: MenuProps["items"] = [
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "退出登录",
      onClick: () => void handleLogout(),
    },
  ];

  return (
    <ProLayout
      title="MAGI"
      logo={
        <Flex
          align="center"
          justify="center"
          style={{
            width: token.controlHeight,
            height: token.controlHeight,
            borderRadius: token.borderRadius,
            color: token.colorWhite,
            background: token.colorPrimary,
            fontWeight: token.fontWeightStrong,
          }}
        >
          M
        </Flex>
      }
      layout="mix"
      navTheme="light"
      fixedHeader
      fixSiderbar
      siderWidth={220}
      location={{ pathname }}
      route={APP_MENU_ROUTE}
      menu={{ locale: false }}
      menuItemRender={(item, defaultDom) => {
        const target =
          typeof item.key === "string" && item.key.startsWith("/")
            ? item.key
            : item.path;
        return target ? <Link to={target}>{defaultDom}</Link> : defaultDom;
      }}
      onMenuHeaderClick={() => void navigate({ to: "/dashboard" })}
      pageTitleRender={false}
      breadcrumbRender={false}
      footerRender={false}
      actionsRender={() => [
        <GlobalTaskStatus key="task-status" />,
        <Dropdown
          key="user-menu"
          menu={{ items: userMenuItems }}
          placement="bottomRight"
        >
          <Button type="text" style={{ height: token.controlHeightLG }}>
            <Flex align="center" gap={token.marginXS}>
              <Avatar size={28} style={{ backgroundColor: token.colorPrimary }}>
                {displayName.charAt(0).toUpperCase()}
              </Avatar>
              {screens.md ? <span>{displayName}</span> : null}
            </Flex>
          </Button>
        </Dropdown>,
      ]}
      contentStyle={{
        minHeight: "calc(100svh - 56px)",
        padding: 0,
      }}
    >
      <div
        style={{
          minWidth: 0,
          padding: screens.lg ? token.paddingLG : token.paddingSM,
        }}
      >
        <div
          style={{
            marginBottom: screens.lg ? token.marginLG : token.marginSM,
            paddingBottom: token.paddingSM,
            borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
          }}
        >
          <AppBreadcrumb />
        </div>
        <Outlet />
      </div>
    </ProLayout>
  );
}

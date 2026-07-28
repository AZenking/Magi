import { Grid, Layout, theme } from "antd";
import { useState } from "react";
import { Outlet } from "@tanstack/react-router";
import { AppMenu } from "./app-menu";
import { AppHeader } from "./app-header";

const { Sider, Content } = Layout;

type AppLayoutProps = {
  userName?: string;
};

export function AppLayout({ userName }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const screens = Grid.useBreakpoint();
  const { token } = theme.useToken();

  return (
    <Layout style={{ minHeight: "100svh" }}>
      <Sider
        breakpoint="lg"
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        collapsedWidth={screens.lg ? 48 : 0}
        theme="dark"
        style={{
          overflow: "auto",
          height: "100svh",
          position: "sticky",
          top: 0,
          left: 0,
        }}
      >
        <div
          style={{
            padding: "16px 0",
            textAlign: "center",
            color: token.colorWhite,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {collapsed ? (
            <span style={{ fontSize: 18 }}>M</span>
          ) : (
            <>
              <div style={{ fontSize: 16, lineHeight: 1.4 }}>MAGI</div>
              <div
                style={{
                  fontSize: 12,
                  color: token.colorTextLightSolid,
                  opacity: 0.65,
                  fontWeight: 400,
                }}
              >
                EPG 管理平台
              </div>
            </>
          )}
        </div>
        <AppMenu />
      </Sider>
      <Layout>
        <AppHeader userName={userName} />
        <Content
          style={{
            minWidth: 0,
            padding: screens.lg ? token.paddingLG : token.paddingSM,
            background: token.colorBgLayout,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

import { useNavigate } from "@tanstack/react-router";
import { Tabs } from "antd";
import { DesktopOutlined, GlobalOutlined } from "@ant-design/icons";

type M3uControlPlaneTab = "sources" | "channels";

const ROUTES: Record<
  M3uControlPlaneTab,
  "/dashboard/sources/m3u" | "/dashboard/sources/channels"
> = {
  sources: "/dashboard/sources/m3u",
  channels: "/dashboard/sources/channels",
};

type M3uControlPlaneNavProps = {
  active: M3uControlPlaneTab;
};

/**
 * Keeps the two M3U source-layer views together without introducing fake
 * routes for sync history or health before those APIs are available.
 */
export function M3uControlPlaneNav({ active }: M3uControlPlaneNavProps) {
  const navigate = useNavigate();

  return (
    <Tabs
      size="small"
      activeKey={active}
      items={[
        {
          key: "sources",
          label: "M3U 源",
          icon: <GlobalOutlined />,
        },
        {
          key: "channels",
          label: "源频道",
          icon: <DesktopOutlined />,
        },
      ]}
      onChange={(key) => {
        if (key === "sources" || key === "channels") {
          void navigate({ to: ROUTES[key] });
        }
      }}
      style={{ marginBottom: 8 }}
    />
  );
}

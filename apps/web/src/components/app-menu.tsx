import { Menu } from "antd";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  AuditOutlined,
  CloudSyncOutlined,
  DashboardOutlined,
  DesktopOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  LinkOutlined,
  ProfileOutlined,
  ScheduleOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import React from "react";

type MenuItem = {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  children?: MenuItem[];
};

const items: MenuItem[] = [
  { key: "/dashboard", label: "仪表盘", icon: <DashboardOutlined /> },
  {
    key: "sources-group",
    label: "源",
    icon: <FolderOpenOutlined />,
    children: [
      { key: "/dashboard/sources/m3u", label: "M3U", icon: <GlobalOutlined /> },
      {
        key: "/dashboard/sources/xmltv",
        label: "EPG/XMLTV",
        icon: <ScheduleOutlined />,
      },
      {
        key: "/dashboard/sources/channels",
        label: "频道",
        icon: <DesktopOutlined />,
      },
      {
        key: "/dashboard/sources/programmes",
        label: "节目单",
        icon: <VideoCameraOutlined />,
      },
    ],
  },
  { key: "/dashboard/epg-matching", label: "EPG 匹配", icon: <LinkOutlined /> },
  { key: "/dashboard/channels", label: "输出频道", icon: <DesktopOutlined /> },
  { key: "/dashboard/tasks", label: "任务", icon: <ProfileOutlined /> },
  { key: "/dashboard/backups", label: "备份", icon: <CloudSyncOutlined /> },
  { key: "/dashboard/audit", label: "审计", icon: <AuditOutlined /> },
];

function isSelected(key: string, pathname: string): boolean {
  if (key === "/dashboard")
    return pathname === "/dashboard" || pathname === "/dashboard/";
  return pathname === key || pathname.startsWith(key + "/");
}

export function AppMenu() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const leafKeys = items.flatMap(
    (i) => i.children?.map((c) => c.key) ?? [i.key],
  );
  const selectedKeys = leafKeys.filter((k) => isSelected(k, pathname));
  const openKeys = pathname.startsWith("/dashboard/sources")
    ? ["sources-group"]
    : [];

  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={selectedKeys}
      defaultOpenKeys={openKeys}
      items={items}
      onClick={({ key }) => {
        if (key.startsWith("/")) {
          void navigate({ to: key });
        }
      }}
    />
  );
}

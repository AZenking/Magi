import { Menu } from "antd";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  AuditOutlined,
  CloudSyncOutlined,
  DashboardOutlined,
  DesktopOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  KeyOutlined,
  LaptopOutlined,
  LinkOutlined,
  MergeCellsOutlined,
  ProfileOutlined,
  ScheduleOutlined,
  ShareAltOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { ProLayoutProps } from "@ant-design/pro-components";
import React, { useMemo } from "react";

type LeafItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
};

type NavSection = {
  /** Stable id used as the top menu key and for active-section matching. */
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Root route used both as the navigation target and the side-menu key for flat sections. */
  rootPath: string;
  /**
   * Route prefixes that belong to this section. Used to derive the active
   * top-level item from the current pathname.
   */
  prefixes: string[];
  /** Leaf routes rendered in the side menu. Empty for flat top-level routes. */
  children: LeafItem[];
};

/**
 * Single source of truth for navigation.
 *
 * Top-level items without children (dashboard, tasks, backups, audit) live
 * under a synthetic "系统" section so the top bar always has an active key.
 */
const NAV_SECTIONS: NavSection[] = [
  {
    id: "dashboard",
    label: "仪表盘",
    icon: <DashboardOutlined />,
    rootPath: "/dashboard",
    prefixes: ["/dashboard", "/dashboard/"],
    children: [],
  },
  {
    id: "sources",
    label: "M3U 源",
    icon: <FolderOpenOutlined />,
    rootPath: "/dashboard/sources/m3u",
    prefixes: ["/dashboard/sources/m3u", "/dashboard/sources/channels"],
    children: [
      {
        key: "/dashboard/sources/m3u",
        label: "M3U 源",
        icon: <GlobalOutlined />,
      },
      {
        key: "/dashboard/sources/channels",
        label: "源频道",
        icon: <DesktopOutlined />,
      },
    ],
  },
  {
    id: "composition",
    label: "频道编排",
    icon: <MergeCellsOutlined />,
    rootPath: "/dashboard/channels",
    prefixes: [
      "/dashboard/channels",
      "/dashboard/epg-matching",
      "/dashboard/merge-candidates",
    ],
    children: [
      {
        key: "/dashboard/channels",
        label: "频道列表",
        icon: <DesktopOutlined />,
      },
      {
        key: "/dashboard/merge-candidates",
        label: "合并候选",
        icon: <MergeCellsOutlined />,
      },
      {
        key: "/dashboard/epg-matching",
        label: "EPG 匹配",
        icon: <LinkOutlined />,
      },
    ],
  },
  {
    id: "output",
    label: "输出",
    icon: <ShareAltOutlined />,
    rootPath: "/dashboard/output-addresses",
    prefixes: ["/dashboard/output-guide", "/dashboard/output-addresses"],
    children: [
      {
        key: "/dashboard/output-addresses",
        label: "输出地址与授权",
        icon: <GlobalOutlined />,
      },
      {
        key: "/dashboard/output-guide",
        label: "节目单预览",
        icon: <ScheduleOutlined />,
      },
    ],
  },
  {
    id: "epg",
    label: "EPG / 节目",
    icon: <ScheduleOutlined />,
    rootPath: "/dashboard/sources/xmltv",
    prefixes: ["/dashboard/sources/xmltv", "/dashboard/sources/programmes"],
    children: [
      {
        key: "/dashboard/sources/xmltv",
        label: "XMLTV 来源",
        icon: <ScheduleOutlined />,
      },
      {
        key: "/dashboard/sources/programmes",
        label: "源节目数据",
        icon: <VideoCameraOutlined />,
      },
    ],
  },
  {
    id: "tasks",
    label: "任务",
    icon: <ProfileOutlined />,
    rootPath: "/dashboard/tasks",
    prefixes: ["/dashboard/tasks"],
    children: [],
  },
  {
    id: "backups",
    label: "备份",
    icon: <CloudSyncOutlined />,
    rootPath: "/dashboard/backups",
    prefixes: ["/dashboard/backups"],
    children: [],
  },
  {
    id: "audit",
    label: "审计",
    icon: <AuditOutlined />,
    rootPath: "/dashboard/audit",
    prefixes: ["/dashboard/audit"],
    children: [],
  },
  {
    id: "account",
    label: "账户",
    icon: <LaptopOutlined />,
    rootPath: "/dashboard/account/clients",
    prefixes: ["/dashboard/account"],
    children: [
      {
        key: "/dashboard/account/clients",
        label: "客户端管理",
        icon: <LaptopOutlined />,
      },
    ],
  },
  {
    id: "open-api",
    label: "开放接口",
    icon: <KeyOutlined />,
    rootPath: "/dashboard/oauth-clients",
    prefixes: ["/dashboard/oauth-clients"],
    children: [
      {
        key: "/dashboard/oauth-clients",
        label: "客户端凭证",
        icon: <KeyOutlined />,
      },
    ],
  },
];

/**
 * Route-shaped navigation consumed by ProLayout. Keeping this derived from
 * NAV_SECTIONS prevents the top bar, sider, and router targets from drifting
 * apart.
 */
export const APP_MENU_ROUTE: NonNullable<ProLayoutProps["route"]> = {
  path: "/dashboard",
  routes: NAV_SECTIONS.map((section) => ({
    key: section.id,
    path:
      section.children.length > 0
        ? `/dashboard/${section.id}`
        : section.rootPath,
    name: section.label,
    icon: section.icon,
    routes:
      section.children.length > 0
        ? section.children.map((child) => ({
            key: child.key,
            path: child.key,
            name: child.label,
            icon: child.icon,
            parentKeys: [section.id],
          }))
        : undefined,
  })),
};

function isPath(prefix: string, pathname: string): boolean {
  if (prefix === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/";
  }
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/** Resolve the active top-level section id from the current pathname. */
export function resolveActiveSection(pathname: string): string | undefined {
  // Match the most specific prefix first to avoid /dashboard catching everything.
  const sorted = [...NAV_SECTIONS].sort(
    (a, b) =>
      Math.max(...b.prefixes.map((p) => p.length)) -
      Math.max(...a.prefixes.map((p) => p.length)),
  );
  return sorted.find((s) => s.prefixes.some((p) => isPath(p, pathname)))?.id;
}

/**
 * Top-level horizontal menu. Shows one entry per nav section; selecting a
 * section navigates to its root path.
 */
export function AppTopMenu() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeSection = resolveActiveSection(pathname);

  const items = NAV_SECTIONS.map((section) => ({
    key: section.id,
    icon: section.icon,
    label: section.label,
  }));

  return (
    <Menu
      theme="dark"
      mode="horizontal"
      selectedKeys={activeSection ? [activeSection] : []}
      items={items}
      style={{
        flex: 1,
        minWidth: 0,
        borderBottom: "none",
        background: "transparent",
      }}
      onClick={({ key }) => {
        const section = NAV_SECTIONS.find((s) => s.id === key);
        if (section) void navigate({ to: section.rootPath });
      }}
    />
  );
}

/**
 * Inline side menu for the currently active section.
 *
 * - Sections with children render those leaves.
 * - Flat sections (dashboard/tasks/backups/audit) render a single selectable
 *   item pointing at the section root, so the sider is never empty.
 */
export function AppSideMenu() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeSection = resolveActiveSection(pathname);

  const section = useMemo(
    () => NAV_SECTIONS.find((s) => s.id === activeSection),
    [activeSection],
  );

  if (!section) return null;

  const items =
    section.children.length > 0
      ? section.children.map((c) => ({
          key: c.key,
          icon: c.icon,
          label: c.label,
        }))
      : [
          {
            key: section.rootPath,
            icon: section.icon,
            label: section.label,
          },
        ];

  const selectedKeys = items
    .filter((it) => isPath(it.key, pathname))
    .map((it) => it.key);

  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={selectedKeys}
      defaultOpenKeys={[]}
      items={items}
      onClick={({ key }) => {
        if (key.startsWith("/")) {
          void navigate({ to: key });
        }
      }}
    />
  );
}

// Backwards-compatible default export kept for any external import.
export function AppMenu() {
  return <AppSideMenu />;
}

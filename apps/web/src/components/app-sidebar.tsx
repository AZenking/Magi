"use client";

import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Tv,
  Radio,
  ListTodo,
  LogOut,
  LinkIcon,
  SunIcon,
  MoonIcon,
  FolderOpen,
  FileVideo,
  Waves,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { signOut } from "@/lib/auth-client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@magi/ui/components/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@magi/ui/components/collapsible";

const topNavItems = [
  { title: "仪表盘", to: "/dashboard" as const, icon: LayoutDashboard, exact: true },
];

const sourceSubItems = [
  { title: "M3U", to: "/dashboard/sources/m3u" as const, icon: Radio },
  { title: "EPG/XMLTV", to: "/dashboard/sources/xmltv" as const, icon: Waves },
  { title: "频道", to: "/dashboard/sources/channels" as const, icon: Tv },
  { title: "节目单", to: "/dashboard/sources/programmes" as const, icon: FileVideo },
];

const bottomNavItems = [
  { title: "EPG 匹配", to: "/dashboard/epg-matching" as const, icon: LinkIcon },
  { title: "输出频道", to: "/dashboard/channels" as const, icon: Tv },
  { title: "任务", to: "/dashboard/tasks" as const, icon: ListTodo },
];

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userName?: string;
}

export function AppSidebar({ userName, ...props }: AppSidebarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const displayName = userName ?? "用户";
  const initial = displayName.charAt(0).toUpperCase();
  const { pathname } = useLocation();

  const isDark = resolvedTheme === "dark";

  function isItemActive(item: { to: string; exact?: boolean }) {
    if (item.exact) return pathname === item.to || pathname === item.to + "/";
    return pathname === item.to || pathname.startsWith(item.to + "/");
  }

  const isSourcesOpen = pathname.startsWith("/dashboard/sources");

  async function handleLogout() {
    await signOut();
    window.location.href = "/login";
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="MAGI">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold">
                M
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">MAGI</span>
                <span className="truncate text-xs">EPG 管理平台</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>管理</SidebarGroupLabel>
          <SidebarMenu>
            {topNavItems.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={isItemActive(item)}>
                  <Link to={item.to}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}

            <Collapsible defaultOpen={isSourcesOpen} className="group/collapsible">
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip="源" isActive={isSourcesOpen}>
                    <FolderOpen />
                    <span>源</span>
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {sourceSubItems.map((item) => (
                      <SidebarMenuSubItem key={item.to}>
                        <SidebarMenuSubButton asChild isActive={isItemActive(item)}>
                          <Link to={item.to}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>

            {bottomNavItems.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={isItemActive(item)}>
                  <Link to={item.to}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={displayName}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {initial}
              </div>
              <span>{displayName}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={isDark ? "切换亮色" : "切换暗色"}
              onClick={() => setTheme(isDark ? "light" : "dark")}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
              <span>{isDark ? "切换亮色" : "切换暗色"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="退出登录"
              onClick={handleLogout}
            >
              <LogOut />
              <span>退出登录</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

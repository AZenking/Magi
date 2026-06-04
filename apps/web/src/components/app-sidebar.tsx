"use client";

import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Tv,
  Radio,
  CalendarDays,
  ListTodo,
  LogOut,
  LinkIcon,
  SunIcon,
  MoonIcon,
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
  SidebarRail,
} from "@magi/ui/components/sidebar";

const navItems = [
  { title: "仪表盘", to: "/dashboard" as const, icon: LayoutDashboard },
  { title: "频道", to: "/dashboard/channels" as const, icon: Tv },
  { title: "EPG 源", to: "/dashboard/epg" as const, icon: Radio },
  { title: "EPG 匹配", to: "/dashboard/epg-matching" as const, icon: LinkIcon },
  { title: "节目单", to: "/dashboard/programmes" as const, icon: CalendarDays },
  { title: "任务", to: "/dashboard/tasks" as const, icon: ListTodo },
];

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userName?: string;
}

export function AppSidebar({ userName, ...props }: AppSidebarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const displayName = userName ?? "用户";
  const initial = displayName.charAt(0).toUpperCase();

  const isDark = resolvedTheme === "dark";

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
            {navItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title}>
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

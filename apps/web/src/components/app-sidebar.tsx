"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  Tv,
  Radio,
  CalendarDays,
  ListTodo,
  LogOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
  { title: "仪表盘", url: "/dashboard", icon: LayoutDashboard },
  { title: "频道", url: "/dashboard/channels", icon: Tv },
  { title: "EPG 源", url: "/dashboard/epg", icon: Radio },
  { title: "节目单", url: "/dashboard/programmes", icon: CalendarDays },
  { title: "任务", url: "/dashboard/tasks", icon: ListTodo },
];

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userName?: string;
}

export function AppSidebar({ userName, ...props }: AppSidebarProps) {
  const router = useRouter();
  const displayName = userName ?? "用户";
  const initial = displayName.charAt(0).toUpperCase();

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
                  <Link href={item.url}>
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
              tooltip="退出登录"
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
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

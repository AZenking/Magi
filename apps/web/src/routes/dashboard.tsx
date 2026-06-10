import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@magi/ui/components/sidebar";
import { Separator } from "@magi/ui/components/separator";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ name: string; username: string } | null>(null);
  const [checking, setChecking] = useState(true);

  const { data } = useQuery({
    queryKey: ["auth-session"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/auth/get-session`, {
        credentials: "include",
      });
      return res.json();
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data === undefined) return;
    if (data?.user) {
      setUser(data.user);
      setChecking(false);
    } else {
      navigate({ to: "/login", search: { callbackUrl: location.pathname }, replace: true });
    }
  }, [data, navigate]);

  if (checking || !user) return null;

  return (
    <SidebarProvider>
      <AppSidebar userName={user.name ?? user.username} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

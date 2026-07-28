import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Flex, Result, Spin } from "antd";
import { AppLayout } from "@/components/app-layout";
import { API_BASE } from "@/services/config";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ name: string; username: string } | null>(
    null,
  );
  const [checking, setChecking] = useState(true);

  const { data, isError, refetch } = useQuery({
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
      navigate({
        to: "/login",
        search: { callbackUrl: location.pathname },
        replace: true,
      });
    }
  }, [data, navigate]);

  if (isError) {
    return (
      <Result
        status="error"
        title="登录状态检查失败"
        subTitle="无法连接认证服务，请检查服务状态后重试。"
        extra={
          <Button type="primary" onClick={() => void refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  if (checking || !user) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: "100vh" }}>
        <Spin description="正在检查登录状态…" size="large" />
      </Flex>
    );
  }

  return <AppLayout userName={user.name ?? user.username} />;
}

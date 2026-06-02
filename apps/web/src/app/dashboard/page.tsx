"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@magi/ui/components/button";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </main>
    );
  }

  if (!session) return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">MAGI Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          欢迎，{session.user.name ?? session.user.username}
        </p>
      </div>
      <Button
        variant="outline"
        onClick={async () => {
          await signOut();
          router.replace("/login");
        }}
      >
        退出登录
      </Button>
    </main>
  );
}

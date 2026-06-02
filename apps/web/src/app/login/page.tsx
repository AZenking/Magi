"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signIn } from "@/lib/auth-client";
import { LoginForm } from "@magi/ui/components/login-form";

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);

    try {
      const formData = new FormData(e.currentTarget);
      const username = String(formData.get("username") ?? "");
      const password = String(formData.get("password") ?? "");

      const { error } = await signIn.username({ username, password });

      if (error) {
        toast.error("用户名或密码错误");
        return;
      }

      toast.success("登录成功");
      router.push("/dashboard");
    } catch {
      toast.error("用户名或密码错误");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2 self-center font-medium">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-semibold">
            M
          </div>
          MAGI
        </div>
        <LoginForm onSubmit={handleSubmit} pending={pending} />
      </div>
    </main>
  );
}

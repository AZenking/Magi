import { Typography, theme as antdTheme } from "antd";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { ProFormInstance } from "@ant-design/pro-components";
import { signIn, useSession } from "@/lib/auth-client";
import { LoginForm, type LoginFormValues } from "@/components/login-form";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    callbackUrl: typeof search.callbackUrl === "string" ? search.callbackUrl : undefined,
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = useSession();
  const { token } = antdTheme.useToken();
  const formRef = useRef<ProFormInstance<LoginFormValues>>(undefined);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const callbackUrl = Route.useSearch().callbackUrl ?? "/dashboard";

  useEffect(() => {
    if (!sessionPending && session) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [session, sessionPending, navigate]);

  async function handleSubmit(values: LoginFormValues) {
    setPending(true);
    setErrorMessage(null);
    try {
      const { error } = await signIn.username({
        username: values.username,
        password: values.password,
      });
      if (error) {
        if (error.status === 401) {
          setErrorMessage("用户名或密码错误");
          formRef.current?.setFieldValue("password", "");
          const passwordField = formRef.current?.getFieldInstance("password") as
            | HTMLInputElement
            | undefined;
          passwordField?.focus?.();
        } else {
          setErrorMessage("登录暂时不可用，请稍后重试");
        }
        return;
      }
      await navigate({ to: callbackUrl, replace: true });
    } catch {
      setErrorMessage("登录暂时不可用，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: token.paddingLG,
        background: token.colorBgLayout,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          padding: token.paddingXL,
          background: token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          boxShadow: token.boxShadowTertiary,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: token.marginSM,
            marginBottom: token.marginMD,
            fontWeight: token.fontWeightStrong,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: token.borderRadius,
              background: token.colorPrimary,
              color: token.colorBgContainer,
              fontSize: token.fontSizeSM,
              fontWeight: token.fontWeightStrong,
            }}
          >
            M
          </div>
          <span>MAGI</span>
        </div>

        <Typography.Title level={2} style={{ marginBottom: token.marginXS }}>
          登录到 MAGI
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: token.marginLG }}>
          输入用户名和密码以进入管理后台
        </Typography.Paragraph>

        <LoginForm
          onFinish={handleSubmit}
          pending={pending}
          errorMessage={errorMessage}
          formRef={formRef}
          onValuesChange={() => setErrorMessage(null)}
        />
      </div>
    </div>
  );
}

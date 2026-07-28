import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { FormInstance } from "antd";
import { Card, Flex, Layout, Tag, Typography, theme } from "antd";
import {
  AppstoreOutlined,
  CheckCircleFilled,
  CloudServerOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";
import { signIn, useSession } from "@/lib/auth-client";
import { LoginForm, type LoginFormValues } from "@/components/login-form";
import "@/styles/login.css";

const { Sider, Content } = Layout;

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    callbackUrl: typeof search.callbackUrl === "string" ? search.callbackUrl : undefined,
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = useSession();
  const { token } = theme.useToken();
  const formRef = useRef<FormInstance<LoginFormValues>>(undefined);
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
    <Layout className="magi-auth-layout" hasSider>
      <Sider className="magi-auth-sider" width={320} theme="dark">
        <Flex vertical className="magi-auth-sider__inner">
          <Flex align="center" gap={token.marginSM}>
            <div
              className="magi-auth-logo"
              style={{
                background: token.colorPrimary,
                borderRadius: token.borderRadiusLG,
                boxShadow: token.boxShadowTertiary,
              }}
            >
              M
            </div>
            <div>
              <Typography.Title
                level={4}
                style={{ margin: 0, color: token.colorWhite }}
              >
                MAGI
              </Typography.Title>
              <Typography.Text style={{ color: token.colorTextLightSolid, opacity: 0.65 }}>
                EPG 管理平台
              </Typography.Text>
            </div>
          </Flex>

          <div className="magi-auth-sider__content">
            <Tag color="blue" variant="filled">
              Personal EPG + Live TV
            </Tag>
            <Typography.Title
              level={2}
              style={{
                margin: `${token.marginLG}px 0 ${token.marginSM}px`,
                color: token.colorWhite,
                lineHeight: 1.35,
              }}
            >
              统一管理节目单
              <br />
              与直播源
            </Typography.Title>
            <Typography.Paragraph
              style={{
                marginBottom: token.marginXL,
                color: token.colorTextLightSolid,
                opacity: 0.65,
                lineHeight: 1.8,
              }}
            >
              聚合频道数据、维护 EPG 匹配关系，
              <br />
              持续掌握输出健康状态。
            </Typography.Paragraph>

            <Flex vertical gap={token.marginMD}>
              {[
                [<CloudServerOutlined key="source" />, "直播源集中管理"],
                [<ScheduleOutlined key="epg" />, "EPG 节目单编排"],
                [<AppstoreOutlined key="channel" />, "频道与输出监控"],
              ].map(([icon, label]) => (
                <Flex
                  key={String(label)}
                  align="center"
                  gap={token.marginSM}
                  style={{ color: token.colorTextLightSolid }}
                >
                  <div
                    className="magi-auth-feature-icon"
                    style={{ borderRadius: token.borderRadius }}
                  >
                    {icon}
                  </div>
                  <span>{label}</span>
                </Flex>
              ))}
            </Flex>
          </div>

          <Typography.Text
            className="magi-auth-sider__footer"
            style={{ color: token.colorTextLightSolid, opacity: 0.45 }}
          >
            MAGI · IPTV/EPG MANAGEMENT SYSTEM
          </Typography.Text>
        </Flex>
      </Sider>

      <Content
        className="magi-auth-content"
        style={{ padding: token.paddingLG, background: token.colorBgLayout }}
      >
        <div className="magi-auth-mobile-brand">
          <div
            className="magi-auth-logo"
            style={{
              background: token.colorPrimary,
              borderRadius: token.borderRadiusLG,
            }}
          >
            M
          </div>
          <div>
            <Typography.Text strong>MAGI</Typography.Text>
            <Typography.Text type="secondary">EPG 管理平台</Typography.Text>
          </div>
        </div>

        <Card
          className="magi-auth-card"
          styles={{ body: { padding: token.paddingXL } }}
          style={{
            borderRadius: token.borderRadiusLG,
            boxShadow: token.boxShadowTertiary,
          }}
        >
          <Flex vertical gap={token.marginXL}>
            <Flex vertical gap={token.marginXS}>
              <Flex align="center" justify="space-between" gap={token.marginSM}>
                <Typography.Title level={2} style={{ margin: 0 }}>
                  登录
                </Typography.Title>
                <Typography.Text type="success" style={{ fontSize: token.fontSizeSM }}>
                  <CheckCircleFilled style={{ marginRight: token.marginXXS }} />
                  服务正常
                </Typography.Text>
              </Flex>
              <Typography.Text type="secondary">
                使用管理员账号登录 MAGI 管理控制台
              </Typography.Text>
            </Flex>

            <LoginForm
              onFinish={handleSubmit}
              pending={pending}
              errorMessage={errorMessage}
              formRef={formRef}
              onValuesChange={() => setErrorMessage(null)}
            />
          </Flex>
        </Card>

        <Typography.Text
          className="magi-auth-copyright"
          type="secondary"
          style={{ fontSize: token.fontSizeSM }}
        >
          © 2026 MAGI · IPTV/EPG Management System
        </Typography.Text>
      </Content>
    </Layout>
  );
}
